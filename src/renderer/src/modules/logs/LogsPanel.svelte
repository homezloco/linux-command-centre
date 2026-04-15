<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Search, X, Play, Square } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type LogEntry = {
    pid: number | null; priority: number; unit: string
    message: string; timestamp: number; identifier: string
  }

  // priority labels & styles
  const PRIORITY = [
    { label: 'EMERG',  class: 'text-red-400 font-bold' },
    { label: 'ALERT',  class: 'text-red-400 font-bold' },
    { label: 'CRIT',   class: 'text-red-400 font-semibold' },
    { label: 'ERR',    class: 'text-red-400' },
    { label: 'WARN',   class: 'text-yellow-400' },
    { label: 'NOTICE', class: 'text-blue-400' },
    { label: 'INFO',   class: 'text-muted-foreground' },
    { label: 'DEBUG',  class: 'text-muted-foreground/60' },
  ]

  const SINCE_OPTIONS = [
    { label: '5 min',  value: '5 minutes ago' },
    { label: '1 hour', value: '1 hour ago' },
    { label: '24 hrs', value: '24 hours ago' },
    { label: '7 days', value: '7 days ago' },
    { label: 'All',    value: '' },
  ]

  let entries = $state<LogEntry[]>([])
  let units = $state<string[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')

  let filterUnit = $state('')
  let filterPriority = $state(6)   // default: up to INFO
  let filterSince = $state('1 hour ago')
  let filterGrep = $state('')
  let grepInput = $state('')
  let liveMode = $state(false)
  let interval: ReturnType<typeof setInterval> | undefined

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      entries = await invoke<LogEntry[]>('logs:query', {
        lines: 300,
        unit: filterUnit || undefined,
        priority: filterPriority,
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

  function clearGrep() {
    grepInput = ''
    filterGrep = ''
    load(true)
  }

  function toggleLive() {
    liveMode = !liveMode
    if (liveMode) {
      interval = setInterval(() => load(true), 3000)
    } else {
      clearInterval(interval)
    }
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

  onMount(() => { load(); loadUnits() })
  onDestroy(() => clearInterval(interval))
</script>

<div class="flex flex-col h-full space-y-3 max-w-3xl">

  <!-- Filter bar -->
  <div class="flex flex-wrap items-center gap-2">

    <!-- Unit filter -->
    <select
      bind:value={filterUnit}
      class="text-xs rounded-md border border-border bg-secondary/50 px-2 py-1.5 max-w-[140px]"
    >
      <option value="">All services</option>
      {#each units as u}
        <option value={u}>{u}</option>
      {/each}
    </select>

    <!-- Priority filter -->
    <select
      bind:value={filterPriority}
      class="text-xs rounded-md border border-border bg-secondary/50 px-2 py-1.5"
    >
      <option value={3}>Errors+</option>
      <option value={4}>Warnings+</option>
      <option value={5}>Notice+</option>
      <option value={6}>Info+</option>
      <option value={7}>Debug+</option>
    </select>

    <!-- Since filter -->
    <div class="flex rounded-md border border-border overflow-hidden text-xs">
      {#each SINCE_OPTIONS as opt}
        <button
          onclick={() => filterSince = opt.value}
          class="px-2.5 py-1.5 transition-colors
                 {filterSince === opt.value ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary text-muted-foreground'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>

    <!-- Grep search -->
    <div class="flex items-center rounded-md border border-border bg-secondary/50 overflow-hidden text-xs flex-1 min-w-[160px]">
      <Search size={12} class="ml-2 text-muted-foreground shrink-0" />
      <input
        bind:value={grepInput}
        onkeydown={(e) => e.key === 'Enter' && applyGrep()}
        placeholder="Filter messages…"
        class="flex-1 bg-transparent px-2 py-1.5 outline-none placeholder:text-muted-foreground/60"
      />
      {#if grepInput}
        <button onclick={clearGrep} class="pr-2 text-muted-foreground hover:text-foreground">
          <X size={12} />
        </button>
      {/if}
    </div>

    <!-- Live toggle -->
    <button
      onclick={toggleLive}
      aria-label="Toggle live mode"
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
             {liveMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'}"
    >
      {#if liveMode}
        <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
        Live
      {:else}
        <Play size={11} />
        Live
      {/if}
    </button>

    <button
      onclick={() => load(true)}
      disabled={refreshing}
      aria-label="Refresh logs"
      class="p-1.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50 text-muted-foreground"
    >
      <RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} />
    </button>
  </div>

  <!-- Error -->
  {#if error}
    <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
  {/if}

  <!-- Log entries -->
  {#if loading}
    <Spinner />
  {:else if entries.length === 0}
    <div class="flex items-center justify-center h-40 text-sm text-muted-foreground">
      No log entries match the current filters
    </div>
  {:else}
    <div class="rounded-xl border border-border bg-card overflow-hidden flex-1">
      <div class="overflow-y-auto max-h-[calc(100vh-220px)]">
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
            {#each entries as entry (entry.timestamp + entry.message.slice(0, 20))}
              <tr class="hover:bg-secondary/30 transition-colors group">
                <td class="px-3 py-1.5 text-muted-foreground/60 font-mono whitespace-nowrap">{fmtTime(entry.timestamp)}</td>
                <td class="px-2 py-1.5 font-mono whitespace-nowrap {priorityClass(entry.priority)}">{priorityLabel(entry.priority)}</td>
                <td class="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]" title={entry.unit}>{entry.unit || entry.identifier}</td>
                <td class="px-2 py-1.5 font-mono text-[11px] leading-relaxed break-all {priorityClass(entry.priority)}">{entry.message}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-[10px] text-muted-foreground text-right">{entries.length} entries</p>
  {/if}

</div>
