<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, X, AlertTriangle } from 'lucide-svelte'

  type Process = {
    pid: number; user: string; cpu: number; mem: number
    vsz: number; rss: number; stat: string; command: string; name: string
  }

  let procs = $state<Process[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let sortBy = $state<'cpu' | 'mem'>('cpu')
  let killing = $state<number | null>(null)
  let confirmKill = $state<{ pid: number; name: string; signal: 'TERM' | 'KILL' } | null>(null)
  let interval: ReturnType<typeof setInterval> | undefined

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      procs = await invoke<Process[]>('processes:list', sortBy)
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function killProc(pid: number, signal: 'TERM' | 'KILL') {
    killing = pid
    confirmKill = null
    try {
      await invoke('processes:kill', pid, signal)
      await load(true)
    } catch (e) { error = String(e) }
    finally { killing = null }
  }

  function cpuBar(pct: number): string {
    if (pct >= 50) return 'bg-red-500'
    if (pct >= 20) return 'bg-yellow-500'
    if (pct >= 5)  return 'bg-primary'
    return 'bg-primary/40'
  }

  function memBar(pct: number): string {
    if (pct >= 10) return 'bg-red-500'
    if (pct >= 5)  return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  $effect(() => {
    void sortBy
    load(true)
  })

  onMount(() => {
    load()
    interval = setInterval(() => load(true), 4000)
  })
  onDestroy(() => clearInterval(interval))
</script>

<!-- Kill confirm dialog -->
{#if confirmKill}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-card border border-border rounded-xl p-5 space-y-4 max-w-sm w-full mx-4 shadow-xl">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle size={18} />
        </div>
        <div>
          <p class="text-sm font-medium">Kill process?</p>
          <p class="text-xs text-muted-foreground">{confirmKill.name} (PID {confirmKill.pid})</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button
          onclick={() => killProc(confirmKill!.pid, confirmKill!.signal)}
          class="flex-1 px-3 py-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          {confirmKill.signal === 'KILL' ? 'Force Kill (SIGKILL)' : 'Terminate (SIGTERM)'}
        </button>
        <button
          onclick={() => confirmKill = null}
          class="px-3 py-2 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Loading -->
{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else}
  <div class="space-y-3 max-w-2xl">

    <!-- Controls -->
    <div class="flex items-center justify-between">
      <div class="flex rounded-lg bg-secondary p-0.5 gap-0.5">
        <button
          onclick={() => sortBy = 'cpu'}
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors
                 {sortBy === 'cpu' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          CPU
        </button>
        <button
          onclick={() => sortBy = 'mem'}
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors
                 {sortBy === 'mem' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
        >
          Memory
        </button>
      </div>
      <div class="flex items-center gap-2">
        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}
        <button
          onclick={() => load(true)}
          disabled={refreshing}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>

    <!-- Table header -->
    <div class="grid grid-cols-[1fr_60px_60px_60px_36px] gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium">
      <span>Process</span>
      <span class="text-right">CPU%</span>
      <span class="text-right">MEM%</span>
      <span class="text-right">RSS</span>
      <span></span>
    </div>

    <!-- Process rows -->
    <div class="space-y-1">
      {#each procs as proc (proc.pid)}
        <div class="grid grid-cols-[1fr_60px_60px_60px_36px] gap-2 items-center
                    rounded-lg border border-border bg-card px-3 py-2
                    hover:border-border/80 transition-colors group">

          <!-- Name + PID + bar -->
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-medium truncate">{proc.name}</span>
              <span class="text-[10px] text-muted-foreground shrink-0">PID {proc.pid}</span>
            </div>
            <div class="flex items-center gap-1 mt-1">
              <!-- Mini CPU bar -->
              <div class="h-1 w-16 rounded-full bg-secondary overflow-hidden">
                <div class="h-full rounded-full {cpuBar(proc.cpu)}" style="width: {Math.min(proc.cpu * 2, 100)}%"></div>
              </div>
              <span class="text-[10px] text-muted-foreground truncate">{proc.user}</span>
            </div>
          </div>

          <!-- CPU% -->
          <span class="text-xs tabular-nums text-right {proc.cpu >= 20 ? 'text-yellow-400 font-medium' : ''}">
            {proc.cpu.toFixed(1)}
          </span>

          <!-- MEM% -->
          <span class="text-xs tabular-nums text-right {proc.mem >= 5 ? 'text-blue-400 font-medium' : ''}">
            {proc.mem.toFixed(1)}
          </span>

          <!-- RSS -->
          <span class="text-xs tabular-nums text-right text-muted-foreground">
            {fmt(proc.rss)}
          </span>

          <!-- Kill button -->
          <div class="flex justify-end">
            {#if killing === proc.pid}
              <RefreshCw size={13} class="animate-spin text-muted-foreground" />
            {:else}
              <button
                onclick={() => confirmKill = { pid: proc.pid, name: proc.name, signal: 'TERM' }}
                aria-label="Kill process {proc.name}"
                class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10
                       hover:text-destructive text-muted-foreground transition-all"
              >
                <X size={13} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <p class="text-xs text-muted-foreground text-center">Top 50 processes · refreshes every 4s</p>
  </div>
{/if}
