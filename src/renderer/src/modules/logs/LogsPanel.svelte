<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, Listbox, SegmentedControl, EmptyState } from '$ui'
  import { RefreshCw, Search, X, Play, ScrollText } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type LogEntry = {
    pid: number | null; priority: number; unit: string
    message: string; timestamp: number; identifier: string; cursor: string
  }

  // priority labels & styles — status tokens, not hardcoded hues
  const PRIORITY = [
    { label: 'EMERG',  class: 'text-status-fail font-bold' },
    { label: 'ALERT',  class: 'text-status-fail font-bold' },
    { label: 'CRIT',   class: 'text-status-fail font-semibold' },
    { label: 'ERR',    class: 'text-status-fail' },
    { label: 'WARN',   class: 'text-status-warn' },
    { label: 'NOTICE', class: 'text-primary' },
    { label: 'INFO',   class: 'text-muted-foreground' },
    { label: 'DEBUG',  class: 'text-muted-foreground/60' },
  ]

  const PRIORITY_OPTIONS = [
    { value: '3', label: 'Errors+' },
    { value: '4', label: 'Warnings+' },
    { value: '5', label: 'Notice+' },
    { value: '6', label: 'Info+' },
    { value: '7', label: 'Debug+' },
  ]

  const SINCE_OPTIONS = [
    { label: '5 min',  value: '5 minutes ago' },
    { label: '1 hour', value: '1 hour ago' },
    { label: '24 hrs', value: '24 hours ago' },
    { label: '7 days', value: '7 days ago' },
    { label: 'All',    value: '' },
  ]

  const DEFAULT_SINCE = '1 hour ago'
  const DEFAULT_PRIORITY = '6'

  let entries = $state<LogEntry[]>([])
  let units = $state<string[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')

  let filterUnit = $state('')
  let filterPriority = $state(DEFAULT_PRIORITY)
  let filterSince = $state(DEFAULT_SINCE)
  let filterGrep = $state('')
  let grepInput = $state('')
  let liveMode = $state(false)
  let interval: ReturnType<typeof setInterval> | undefined

  const unitOptions = $derived([
    { value: '', label: 'All services' },
    ...units.map(u => ({ value: u, label: u })),
  ])

  const hasFilter = $derived(
    !!filterUnit || !!filterGrep || filterPriority !== DEFAULT_PRIORITY || filterSince !== DEFAULT_SINCE
  )

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      entries = await invoke<LogEntry[]>('logs:query', {
        lines: 300,
        unit: filterUnit || undefined,
        priority: Number(filterPriority),
        since: filterSince || undefined,
        grep: filterGrep || undefined,
      })
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function loadUnits() {
    try { units = await invoke<string[]>('logs:units') } catch { /* ignore */ }
  }

  function applyGrep() {
    filterGrep = grepInput.trim()
    load(true)
  }

  function clearFilters() {
    grepInput = ''
    filterGrep = ''
    filterUnit = ''
    filterPriority = DEFAULT_PRIORITY
    filterSince = DEFAULT_SINCE
    load(true)
  }

  function toggleLive() {
    liveMode = !liveMode
  }

  function priorityClass(p: number): string {
    return PRIORITY[Math.min(p, 7)]?.class ?? 'text-muted-foreground'
  }

  function priorityLabel(p: number): string {
    return PRIORITY[Math.min(p, 7)]?.label ?? 'INFO'
  }

  function fmtTime(ms: number): string {
    if (!ms) return ''
    const d = new Date(ms)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  $effect(() => {
    void filterUnit; void filterPriority; void filterSince
    load(true)
  })

  $effect(() => {
    if (!visible || !liveMode) { clearInterval(interval); interval = undefined; return }
    if (!interval) interval = setInterval(() => load(true), 3000)
  })

  onMount(() => { load(); loadUnits() })
  onDestroy(() => clearInterval(interval))
</script>

<Page fill>
  <div class="flex flex-col flex-1 min-h-0 gap-3">

    <!-- Filter bar — two rows -->
    <div class="shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <div class="w-56 shrink-0">
          <Listbox
            filterable
            id="log-unit"
            aria-label="Filter by unit"
            value={filterUnit}
            options={unitOptions}
            onChange={(v) => { filterUnit = v }}
          />
        </div>
        <div class="w-36 shrink-0">
          <Listbox
            id="log-priority"
            aria-label="Minimum priority"
            value={filterPriority}
            options={PRIORITY_OPTIONS}
            onChange={(v) => { filterPriority = v }}
          />
        </div>
        <SegmentedControl
          value={filterSince}
          options={SINCE_OPTIONS}
          ariaLabel="Time range"
          onChange={(v) => { filterSince = v }}
        />

        <div class="flex-1"></div>

        <button
          onclick={toggleLive}
          aria-label="Toggle live mode"
          aria-pressed={liveMode}
          class="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors shrink-0
                 {liveMode
                   ? 'bg-status-ok/15 text-status-ok border border-status-ok/30'
                   : 'bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border'}"
        >
          {#if liveMode}
            <span class="w-1.5 h-1.5 rounded-full bg-status-ok motion-safe:animate-pulse"></span>
          {:else}
            <Play size={11} />
          {/if}
          Live
        </button>

        <Button
          variant="icon"
          size="sm"
          aria-label="Refresh logs"
          disabled={refreshing || loading}
          onclick={() => load(true)}
        >
          <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
        </Button>
      </div>

      <!-- Grep: server-side filter, applied on Enter -->
      <form
        class="flex items-center h-8 rounded-md border border-border bg-secondary/50 text-[13px]"
        onsubmit={(e) => { e.preventDefault(); applyGrep() }}
      >
        <Search size={14} class="ml-2.5 text-muted-foreground shrink-0 pointer-events-none" />
        <input
          bind:value={grepInput}
          placeholder="Filter messages… (Enter to apply)"
          aria-label="Filter log messages"
          class="flex-1 min-w-0 bg-transparent px-2 outline-none placeholder:text-muted-foreground/50"
        />
        {#if grepInput}
          <Button variant="icon" size="sm" aria-label="Clear message filter" onclick={() => { grepInput = ''; filterGrep = ''; load(true) }}>
            <X size={12} />
          </Button>
        {/if}
      </form>
    </div>

    {#if error}
      <div class="shrink-0"><Alert message={error} /></div>
    {/if}

    {#if loading}
      <Card padding="none" class="flex-1 min-h-0">
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}
          <div class="flex items-center gap-3 px-3 py-2.5 border-b border-border/60 last:border-0">
            <Skeleton class="h-3 w-14 shrink-0" />
            <Skeleton class="h-3 w-12 shrink-0" />
            <Skeleton class="h-3 w-24 shrink-0" />
            <Skeleton class="h-3 flex-1" />
          </div>
        {/each}
      </Card>
    {:else if entries.length === 0}
      <EmptyState
        icon={ScrollText}
        title="No log entries"
        message={hasFilter ? 'No entries match the current filters.' : 'The journal returned no entries for this range.'}
      >
        {#snippet action()}
          {#if hasFilter}
            <Button variant="secondary" size="sm" onclick={clearFilters}>Clear filters</Button>
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <!-- One inner scroller -->
      <div class="rounded-xl border border-border bg-card flex-1 min-h-0 overflow-auto">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-card border-b border-border z-10">
            <tr class="text-muted-foreground">
              <th class="text-left px-3 py-2 font-medium w-20">Time</th>
              <th class="text-left px-2 py-2 font-medium w-14">Level</th>
              <th class="text-left px-2 py-2 font-medium w-28">Unit</th>
              <th class="text-left px-2 py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            {#each entries as entry, i (entry.cursor || i)}
              <tr class="hover:bg-secondary/30 transition-colors">
                <td class="px-3 py-1.5 text-muted-foreground/60 font-mono whitespace-nowrap">{fmtTime(entry.timestamp)}</td>
                <td class="px-2 py-1.5 font-mono whitespace-nowrap {priorityClass(entry.priority)}">{priorityLabel(entry.priority)}</td>
                <td class="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]" title={entry.unit}>{entry.unit || entry.identifier}</td>
                <td class="px-2 py-1.5 font-mono text-[11px] leading-relaxed break-all {priorityClass(entry.priority)}">{entry.message}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="shrink-0 text-[11px] text-muted-foreground text-right">{entries.length} entries</p>
    {/if}

  </div>
</Page>
