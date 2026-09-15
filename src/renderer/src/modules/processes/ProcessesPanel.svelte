<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { reduceEffects } from '$stores/theme'
  import { Page, Card, Skeleton, Button, SegmentedControl, SearchField, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, X, CircleX } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type Process = {
    pid: number; user: string; cpu: number; mem: number
    vsz: number; rss: number; stat: string; command: string; name: string
  }

  const TITLE = 'Processes'
  const GRID = 'grid-cols-[minmax(12rem,1fr)_5rem_5rem_6rem_2.75rem]'
  const SORT_OPTIONS: { value: 'cpu' | 'mem'; label: string }[] = [
    { value: 'cpu', label: 'CPU' },
    { value: 'mem', label: 'Memory' },
  ]

  let procs = $state<Process[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let sortBy = $state<'cpu' | 'mem'>('cpu')
  let query  = $state('')
  let killing = $state<number | null>(null)
  let confirmKill = $state<{ pid: number; name: string } | null>(null)
  let interval: ReturnType<typeof setInterval> | undefined

  // On background polls, update values in place and keep row order stable —
  // re-sorting every 4s just because a near-zero-CPU process ticked up 0.1%
  // makes the whole list constantly reshuffle. Only re-sort on an explicit
  // action (manual refresh, sort toggle, after a kill).
  function mergeInPlace(current: Process[], fresh: Process[]): Process[] {
    const freshByPid = new Map(fresh.map(p => [p.pid, p]))
    const merged: Process[] = []
    for (const p of current) {
      const updated = freshByPid.get(p.pid)
      if (updated) { merged.push(updated); freshByPid.delete(p.pid) }
    }
    for (const p of fresh) {
      if (freshByPid.has(p.pid)) merged.push(p)   // genuinely new PIDs, appended
    }
    return merged
  }

  async function load(force = false, merge = false) {
    if (refreshing || (force && loading)) return
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      const fresh = await invoke<Process[]>('processes:list', sortBy)
      procs = merge && procs.length > 0 ? mergeInPlace(procs, fresh) : fresh
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function killProc(pid: number, signal: 'TERM' | 'KILL') {
    killing = pid
    try {
      await invoke('processes:kill', pid, signal)
      toasts.success(`Sent ${signal === 'KILL' ? 'SIGKILL' : 'SIGTERM'} to PID ${pid}`, TITLE)
      confirmKill = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { killing = null }
  }

  function cpuBar(pct: number): string {
    if (pct >= 50) return 'bg-status-fail'
    if (pct >= 20) return 'bg-status-warn'
    if (pct >= 5)  return 'bg-primary'
    return 'bg-primary/40'
  }

  function memBar(pct: number): string {
    if (pct >= 10) return 'bg-status-fail'
    if (pct >= 5)  return 'bg-status-warn'
    return 'bg-primary'
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  const filtered = $derived(
    query.trim()
      ? procs.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) ||
                          p.command.toLowerCase().includes(query.toLowerCase()) ||
                          String(p.pid).includes(query))
      : procs
  )

  let mounted = false
  onMount(() => {
    mounted = true
    load()
  })

  $effect(() => {
    if (!visible) { clearInterval(interval); interval = undefined; return }
    if (!interval) interval = setInterval(() => load(true, true), 4000)
  })

  $effect(() => {
    void sortBy
    if (mounted) load(true)
  })
  onDestroy(() => clearInterval(interval))
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh processes"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
    <!-- Controls -->
    <div class="flex items-center gap-2">
      <SearchField
        value={query}
        placeholder="Filter by name, command or PID…"
        aria-label="Filter processes"
        class="flex-1"
        onChange={(v) => { query = v }}
      />
      <SegmentedControl
        value={sortBy}
        options={SORT_OPTIONS}
        ariaLabel="Sort processes by"
        onChange={(v) => { sortBy = v }}
      />
    </div>

    {#if error}<Alert message={error} />{/if}

    {#if loading}
      <Card padding="none">
        {#each [0, 1, 2, 3, 4, 5] as i (i)}
          <div class="grid {GRID} gap-2 items-center px-3 py-3 border-b border-border/60 last:border-0">
            <div class="space-y-1.5">
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-2 w-24" />
            </div>
            <Skeleton class="h-3 w-10 justify-self-end" />
            <Skeleton class="h-3 w-10 justify-self-end" />
            <Skeleton class="h-3 w-12 justify-self-end" />
            <span></span>
          </div>
        {/each}
      </Card>
    {:else if filtered.length === 0}
      <EmptyState
        icon={CircleX}
        title={query ? 'No processes match' : 'No processes'}
        message={query ? 'Nothing matches the current filter.' : 'The process list came back empty.'}
      >
        {#snippet action()}
          {#if query}
            <Button variant="secondary" size="sm" onclick={() => { query = '' }}>Clear filter</Button>
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <!-- Table header -->
      <div class="grid {GRID} gap-2 px-3 text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">
        <span>Process</span>
        <span class="text-right">CPU%</span>
        <span class="text-right">MEM%</span>
        <span class="text-right">RSS</span>
        <span></span>
      </div>

      <!-- Process rows -->
      <div class="space-y-1">
        {#each filtered as proc (proc.pid)}
          <div
            animate:flip={{ duration: $reduceEffects ? 0 : 250 }}
            transition:fade={{ duration: $reduceEffects ? 0 : 150 }}
            class="grid {GRID} gap-2 items-center
                      rounded-lg border border-border bg-card px-3 py-2
                      hover:border-border/80 transition-colors">

            <!-- Name + PID + bar -->
            <div class="min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-[13px] font-medium truncate" title={proc.command}>{proc.name}</span>
                <span class="text-[11px] text-muted-foreground shrink-0">PID {proc.pid}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <div class="h-1 w-16 rounded-full bg-secondary overflow-hidden">
                  <div class="h-full rounded-full {cpuBar(proc.cpu)}" style="width: {Math.min(proc.cpu * 2, 100)}%"></div>
                </div>
                <span class="text-[11px] text-muted-foreground truncate">{proc.user}</span>
              </div>
            </div>

            <!-- CPU% -->
            <span class="text-xs tabular-nums text-right {proc.cpu >= 20 ? 'text-status-warn font-medium' : ''}">
              {proc.cpu.toFixed(1)}
            </span>

            <!-- MEM% -->
            <span class="text-xs tabular-nums text-right {proc.mem >= 5 ? 'text-primary font-medium' : ''}">
              {proc.mem.toFixed(1)}
            </span>

            <!-- RSS -->
            <span class="text-xs tabular-nums text-right text-muted-foreground">
              {fmt(proc.rss)}
            </span>

            <!-- Kill — always visible -->
            <div class="flex justify-end">
              {#if killing === proc.pid}
                <RefreshCw size={13} class="animate-spin text-muted-foreground" />
              {:else}
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="Stop {proc.name}"
                  class="hover:text-destructive"
                  onclick={() => { confirmKill = { pid: proc.pid, name: proc.name } }}
                >
                  <X size={13} />
                </Button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <p class="text-xs text-muted-foreground text-center">
        {#if query}
          {filtered.length} of {procs.length} processes
        {:else}
          Top {procs.length} by {sortBy} · refreshes every 4s
        {/if}
      </p>
    {/if}
  </div>

  <ConfirmDialog
    open={confirmKill !== null}
    onOpenChange={(open) => { if (!open) confirmKill = null }}
    title="Stop {confirmKill?.name ?? ''}?"
    description="Terminate (SIGTERM) asks the process to exit cleanly. Force kill (SIGKILL) ends it immediately — unsaved work is lost and the process cannot clean up."
    busy={killing !== null}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { confirmKill = null } },
      { label: 'Terminate', variant: 'primary', onClick: () => killProc(confirmKill!.pid, 'TERM') },
      { label: 'Force kill', variant: 'destructive', onClick: () => killProc(confirmKill!.pid, 'KILL') },
    ]}
  />
</Page>
