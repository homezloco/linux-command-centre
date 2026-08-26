<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Cpu, MemoryStick, RefreshCw, Server, Clock, Activity, Layers, Sparkles, Send,
           CircuitBoard, MonitorPlay, Eye, ChevronDown } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type SystemStatus = {
    hostname: string; osName: string; kernel: string; arch: string
    uptime: { days: number; hours: number; minutes: number; totalSeconds: number }
    cpu: { model: string; cores: number; usage: number; coreUsages: number[] }
    memory: { total: number; used: number; available: number; swapTotal: number; swapUsed: number }
    load: { one: number; five: number; fifteen: number }
    processes: number
  }

  type SystemSpecs = {
    vendor: string; model: string; version: string; family: string; sku: string
    board: { vendor: string; name: string; version: string }
    bios: { vendor: string; version: string; date: string }
    chassis: string
    cpu: {
      model: string; vendor: string; architecture: string
      sockets: number; coresPerSocket: number; threadsPerCore: number
      totalCores: number; totalThreads: number
      maxMhz: number | null; minMhz: number | null
      virtualization: string
      caches: { l1d: string; l1i: string; l2: string; l3: string }
    }
    gpus: { description: string; driver: string }[]
  }

  type MemoryDetails = {
    slotsTotal: number; slotsUsed: number
    dimms: { locator: string; size: string; speed: string; type: string; manufacturer: string; partNumber: string }[]
  }

  const HISTORY_MAX = 60   // 5 minutes at 5s interval
  const SPARK_W    = 240
  const SPARK_H    = 40

  let status   = $state<SystemStatus | null>(null)
  let loading  = $state(true)
  let refreshing = $state(false)
  let error    = $state('')
  let interval: ReturnType<typeof setInterval> | undefined

  // rolling history: {cpu, mem} percentages
  let history = $state<{ cpu: number; mem: number }[]>([])

  async function load(force = false) {
    if (refreshing || (force && loading)) return
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      status = await invoke<SystemStatus>('system:status')
      if (status) {
        const memPct = Math.round(status.memory.used / status.memory.total * 100)
        history = [...history, { cpu: status.cpu.usage, mem: memPct }].slice(-HISTORY_MAX)
      }
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  // ── Static hardware specs (loaded once, not on the polling interval) ─────
  let specs      = $state<SystemSpecs | null>(null)
  let specsError = $state('')

  async function loadSpecs() {
    try { specs = await invoke<SystemSpecs>('system:specs') }
    catch (e) { specsError = String(e) }
  }

  // ── Per-DIMM memory details (privileged, fetched on demand) ──────────────
  let memDetails    = $state<MemoryDetails | null>(null)
  let memLoading    = $state(false)
  let memError      = $state('')

  async function loadMemoryDetails() {
    memLoading = true; memError = ''
    try { memDetails = await invoke<MemoryDetails>('system:memoryDetails') }
    catch (e) { memError = String(e) }
    finally { memLoading = false }
  }

  // Build SVG polyline points from a data series (0-100)
  function sparkPoints(data: number[]): string {
    if (data.length < 2) return ''
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W
      const y = SPARK_H - (Math.max(0, Math.min(100, v)) / 100) * SPARK_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  // Build closed SVG path for the filled area under the sparkline
  function sparkArea(data: number[]): string {
    if (data.length < 2) return ''
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W
      const y = SPARK_H - (Math.max(0, Math.min(100, v)) / 100) * SPARK_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return `M0,${SPARK_H} L${pts.join(' L')} L${SPARK_W},${SPARK_H} Z`
  }

  function usageColor(pct: number): string {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 70) return 'bg-yellow-500'
    return 'bg-primary'
  }

  function sparkColor(pct: number): string {
    if (pct >= 90) return '#ef4444'
    if (pct >= 70) return '#eab308'
    return 'hsl(var(--primary))'
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
    if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  function uptimeStr(u: SystemStatus['uptime']): string {
    const parts: string[] = []
    if (u.days > 0)  parts.push(`${u.days}d`)
    if (u.hours > 0) parts.push(`${u.hours}h`)
    parts.push(`${u.minutes}m`)
    return parts.join(' ')
  }

  function fmtGhz(mhz: number | null): string {
    if (!mhz) return '—'
    return (mhz / 1000).toFixed(2) + ' GHz'
  }

  // Strip the "(N instances)" suffix lscpu appends to cache sizes
  function fmtCache(s: string): string {
    return s ? s.replace(/\s*\(.*\)$/, '') : '—'
  }

  onMount(() => { load(); loadSpecs(); interval = setInterval(() => load(true), 5000) })
  onDestroy(() => clearInterval(interval))

  // ── AI Diagnostics ──────────────────────────────────────────────────────
  let aiQuery    = $state('')
  let aiAsking   = $state(false)
  let aiError    = $state('')
  let aiAnswer   = $state('')
  let aiTools    = $state<string[]>([])

  async function askAi() {
    const q = aiQuery.trim()
    if (!q || aiAsking) return
    aiAsking = true
    aiError = ''
    aiAnswer = ''
    aiTools = []
    try {
      const result = await invoke<{ text: string; toolsUsed: string[] }>('ai:diagnose', q)
      aiAnswer = result.text
      aiTools = [...new Set(result.toolsUsed)]
    } catch (e) {
      aiError = String(e)
    } finally {
      aiAsking = false
    }
  }
</script>

{#if loading}
  <Spinner />

{:else if error}
  <Alert message={error} />

{:else if status}
  {@const memPct = Math.round(status.memory.used / status.memory.total * 100)}
  {@const cpuHistory = history.map(h => h.cpu)}
  {@const memHistory = history.map(h => h.mem)}

  <div class="space-y-4 max-w-2xl">

    <!-- Header banner -->
    <div class="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Server size={15} />
        </div>
        <div>
          <p class="text-sm font-semibold leading-tight">{status.hostname}</p>
          <p class="text-xs text-muted-foreground leading-tight">{status.osName}</p>
        </div>
      </div>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
               text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>

    <!-- Machine identity -->
    {#if specs}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
            <CircuitBoard size={15} />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium leading-tight">
              {specs.vendor} {specs.model}{specs.version && specs.version !== specs.model ? ` (${specs.version})` : ''}
            </p>
            <p class="text-xs text-muted-foreground leading-tight mt-0.5">{specs.chassis}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-border/60 text-xs">
          <div class="flex justify-between gap-2">
            <span class="text-muted-foreground">Motherboard</span>
            <span class="font-medium text-right truncate">{specs.board.vendor} {specs.board.name}</span>
          </div>
          <div class="flex justify-between gap-2">
            <span class="text-muted-foreground">BIOS</span>
            <span class="font-medium text-right truncate">{specs.bios.vendor} {specs.bios.version}</span>
          </div>
          {#if specs.family}
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">Family</span>
              <span class="font-medium text-right truncate">{specs.family}</span>
            </div>
          {/if}
          {#if specs.bios.date}
            <div class="flex justify-between gap-2">
              <span class="text-muted-foreground">BIOS date</span>
              <span class="font-medium text-right truncate">{specs.bios.date}</span>
            </div>
          {/if}
        </div>
      </div>
    {:else if specsError}
      <Alert message={specsError} />
    {/if}

    <!-- AI Diagnostics -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Sparkles size={14} />
        </div>
        <p class="text-sm font-medium">Ask AI why something's off</p>
      </div>

      <form
        class="flex items-center gap-2"
        onsubmit={(e) => { e.preventDefault(); askAi() }}
      >
        <input
          type="text"
          bind:value={aiQuery}
          disabled={aiAsking}
          placeholder="e.g. why is my system running slow?"
          class="flex-1 min-w-0 text-xs px-3 py-2 rounded-md bg-secondary/40 border border-border
                 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary
                 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={aiAsking || !aiQuery.trim()}
          class="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border
                 hover:bg-secondary transition-colors disabled:opacity-50 shrink-0"
        >
          {#if aiAsking}
            <RefreshCw size={12} class="animate-spin" />
          {:else}
            <Send size={12} />
          {/if}
          Ask
        </button>
      </form>

      {#if aiError}
        <Alert message={aiError} />
      {:else if aiAnswer}
        <div class="rounded-lg bg-secondary/40 p-3 space-y-2">
          <p class="text-xs leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
          {#if aiTools.length > 0}
            <div class="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
              {#each aiTools as tool}
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground/70">{tool}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Info row -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl border border-border bg-card p-3 flex items-start gap-2.5">
        <div class="w-7 h-7 rounded-md bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
          <Layers size={13} />
        </div>
        <div class="min-w-0">
          <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Kernel</p>
          <p class="text-sm font-medium truncate leading-tight mt-0.5">{status.kernel}</p>
          <p class="text-xs text-muted-foreground">{status.arch}</p>
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3 flex items-start gap-2.5">
        <div class="w-7 h-7 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
          <Clock size={13} />
        </div>
        <div>
          <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Uptime</p>
          <p class="text-sm font-medium leading-tight mt-0.5">{uptimeStr(status.uptime)}</p>
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3 flex items-start gap-2.5">
        <div class="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
          <Activity size={13} />
        </div>
        <div>
          <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Processes</p>
          <p class="text-sm font-medium leading-tight mt-0.5">{status.processes}</p>
          <p class="text-xs text-muted-foreground">running</p>
        </div>
      </div>
    </div>

    <!-- CPU -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <Cpu size={16} />
          </div>
          <div>
            <p class="text-sm font-medium truncate max-w-xs">{status.cpu.model}</p>
            <p class="text-xs text-muted-foreground">
              {#if specs}
                {specs.cpu.vendor ? specs.cpu.vendor + ' · ' : ''}{specs.cpu.sockets > 1 ? `${specs.cpu.sockets} sockets · ` : ''}{specs.cpu.coresPerSocket || status.cpu.cores} cores · {specs.cpu.totalThreads || status.cpu.cores} threads
              {:else}
                {status.cpu.cores} logical cores
              {/if}
            </p>
          </div>
        </div>
        <span class="text-2xl font-semibold tabular-nums">{status.cpu.usage}%</span>
      </div>

      {#if specs}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
            <p class="text-[9px] text-muted-foreground/70 uppercase tracking-wide">Base / Max</p>
            <p class="text-xs font-medium tabular-nums mt-0.5">{fmtGhz(specs.cpu.minMhz)} – {fmtGhz(specs.cpu.maxMhz)}</p>
          </div>
          <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
            <p class="text-[9px] text-muted-foreground/70 uppercase tracking-wide">L2 / L3 Cache</p>
            <p class="text-xs font-medium tabular-nums mt-0.5">{fmtCache(specs.cpu.caches.l2)} / {fmtCache(specs.cpu.caches.l3)}</p>
          </div>
          <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
            <p class="text-[9px] text-muted-foreground/70 uppercase tracking-wide">L1 Cache</p>
            <p class="text-xs font-medium tabular-nums mt-0.5">{fmtCache(specs.cpu.caches.l1d)} d / {fmtCache(specs.cpu.caches.l1i)} i</p>
          </div>
          <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
            <p class="text-[9px] text-muted-foreground/70 uppercase tracking-wide">Virtualization</p>
            <p class="text-xs font-medium mt-0.5">{specs.cpu.virtualization || 'Not detected'}</p>
          </div>
        </div>
      {/if}

      <!-- Sparkline -->
      {#if cpuHistory.length >= 2}
        <div class="relative h-10 w-full overflow-hidden rounded-md bg-secondary/40">
          <svg
            viewBox="0 0 {SPARK_W} {SPARK_H}"
            preserveAspectRatio="none"
            class="absolute inset-0 w-full h-full"
          >
            <path d={sparkArea(cpuHistory)} fill={sparkColor(status.cpu.usage)} opacity="0.15" />
            <polyline
              points={sparkPoints(cpuHistory)}
              fill="none"
              stroke={sparkColor(status.cpu.usage)}
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <span class="absolute bottom-1 right-2 text-[9px] text-muted-foreground/60">5 min</span>
        </div>
      {:else}
        <!-- Progress bar before history builds up -->
        <div class="h-2 rounded-full bg-secondary overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 {usageColor(status.cpu.usage)}"
               style="width: {status.cpu.usage}%"></div>
        </div>
      {/if}

      <!-- Load average -->
      <div class="grid grid-cols-3 gap-2">
        {#each [['1m', status.load.one], ['5m', status.load.five], ['15m', status.load.fifteen]] as [label, val]}
          <div class="rounded-md bg-secondary/40 px-2.5 py-1.5 flex items-center justify-between">
            <span class="text-[10px] text-muted-foreground">Load {label}</span>
            <span class="text-xs font-medium tabular-nums">{(val as number).toFixed(2)}</span>
          </div>
        {/each}
      </div>

      <!-- Per-core grid -->
      {#if status.cpu.coreUsages && status.cpu.coreUsages.length > 0}
        <div class="border-t border-border pt-3">
          <p class="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">Per-core</p>
          <div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fill, minmax(58px, 1fr))">
            {#each status.cpu.coreUsages as pct, i}
              <div class="rounded-md bg-secondary/40 p-1.5 space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[9px] text-muted-foreground/60 font-medium">C{i}</span>
                  <span class="text-[10px] font-semibold tabular-nums {pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-foreground/80'}">{pct}%</span>
                </div>
                <div class="h-[3px] rounded-full bg-secondary overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500 {pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary'}"
                       style="width: {pct}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Graphics -->
    {#if specs && specs.gpus.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-2.5">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <MonitorPlay size={16} />
          </div>
          <p class="text-sm font-medium">Graphics</p>
        </div>
        <div class="space-y-1.5">
          {#each specs.gpus as gpu}
            <div class="rounded-md bg-secondary/40 px-3 py-2 flex items-center justify-between gap-3">
              <span class="text-xs font-medium truncate">{gpu.description}</span>
              {#if gpu.driver}
                <span class="text-[10px] font-mono text-muted-foreground shrink-0">{gpu.driver}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Memory -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <MemoryStick size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">Memory</p>
            <p class="text-xs text-muted-foreground">{fmt(status.memory.used)} used of {fmt(status.memory.total)}</p>
          </div>
        </div>
        <span class="text-2xl font-semibold tabular-nums">{memPct}%</span>
      </div>

      <!-- Sparkline -->
      {#if memHistory.length >= 2}
        <div class="relative h-10 w-full overflow-hidden rounded-md bg-secondary/40">
          <svg
            viewBox="0 0 {SPARK_W} {SPARK_H}"
            preserveAspectRatio="none"
            class="absolute inset-0 w-full h-full"
          >
            <path d={sparkArea(memHistory)} fill={sparkColor(memPct)} opacity="0.15" />
            <polyline
              points={sparkPoints(memHistory)}
              fill="none"
              stroke={sparkColor(memPct)}
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
          <span class="absolute bottom-1 right-2 text-[9px] text-muted-foreground/60">5 min</span>
        </div>
      {:else}
        <div class="h-2 rounded-full bg-secondary overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 {usageColor(memPct)}"
               style="width: {memPct}%"></div>
        </div>
      {/if}

      <div class="flex justify-between text-xs text-muted-foreground">
        <span>{fmt(status.memory.used)} used</span>
        <span>{fmt(status.memory.available)} available</span>
      </div>

      <!-- Per-DIMM details (privileged, on demand) -->
      <div class="border-t border-border pt-3">
        {#if !memDetails}
          <button
            onclick={loadMemoryDetails}
            disabled={memLoading}
            class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {#if memLoading}
              <RefreshCw size={12} class="animate-spin" />
              Reading memory modules…
            {:else}
              <Eye size={12} />
              Show memory module details
            {/if}
          </button>
          {#if memError}
            <p class="text-[11px] text-destructive mt-1.5">{memError}</p>
          {/if}
        {:else}
          <div class="flex items-center justify-between mb-2">
            <p class="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
              Memory modules ({memDetails.slotsUsed}{memDetails.slotsTotal ? ` of ${memDetails.slotsTotal}` : ''} slots)
            </p>
            <button
              onclick={() => memDetails = null}
              class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown size={11} />
              Hide
            </button>
          </div>
          {#if memDetails.dimms.length > 0}
            <div class="space-y-1.5">
              {#each memDetails.dimms as dimm}
                <div class="rounded-md bg-secondary/40 px-3 py-2 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-medium truncate">{dimm.locator}</p>
                    <p class="text-[10px] text-muted-foreground truncate">{dimm.manufacturer || 'Unknown'}{dimm.partNumber ? ` · ${dimm.partNumber}` : ''}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-xs font-medium tabular-nums">{dimm.size}</p>
                    <p class="text-[10px] text-muted-foreground">{dimm.type}{dimm.speed ? ` · ${dimm.speed}` : ''}</p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[11px] text-muted-foreground">No memory module details available</p>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Swap -->
    {#if status.memory.swapTotal > 0}
      {@const swapPct = Math.round(status.memory.swapUsed / status.memory.swapTotal * 100)}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-secondary text-muted-foreground">
              <Server size={16} />
            </div>
            <div>
              <p class="text-sm font-medium">Swap</p>
              <p class="text-xs text-muted-foreground">{fmt(status.memory.swapUsed)} used of {fmt(status.memory.swapTotal)}</p>
            </div>
          </div>
          <span class="text-2xl font-semibold tabular-nums">{swapPct}%</span>
        </div>
        <div class="h-2 rounded-full bg-secondary overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500 {usageColor(swapPct)}"
               style="width: {swapPct}%"></div>
        </div>
      </div>
    {/if}

  </div>
{/if}
