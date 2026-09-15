<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button } from '$ui'
  import { toasts } from '$stores/toasts'
  import { Cpu, MemoryStick, RefreshCw, Server, Clock, Activity, Layers, Sparkles, Send,
           CircuitBoard, MonitorPlay, Eye, ChevronDown, Timer, SlidersHorizontal, Check } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type SystemStatus = {
    hostname: string; osName: string; kernel: string; arch: string
    uptime: { days: number; hours: number; minutes: number; totalSeconds: number }
    cpu: { model: string; cores: number; usage: number; coreUsages: number[] }
    gpu: { vendor: string; busyPct: number | null; curMhz: number | null; maxMhz: number | null; memUsed: number | null; memTotal: number | null } | null
    memory: { total: number; used: number; available: number; swapTotal: number; swapUsed: number }
    load: { one: number; five: number; fifteen: number }
    processes: number
  }

  type BootTime = {
    totalSeconds: number | null
    firmware: number | null; loader: number | null; kernel: number | null; userspace: number | null
    slowest: { time: string; unit: string }[]
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

  const TUNABLES = [
    { key: 'vm.swappiness',         label: 'Swappiness',         hint: 'Lower favors RAM over swap (0–200)' },
    { key: 'vm.vfs_cache_pressure', label: 'VFS cache pressure', hint: 'Lower retains filesystem cache longer (0–1000)' },
  ] as const

  const labelCls = 'text-[11px] text-muted-foreground uppercase tracking-wide'
  const statCls  = 'rounded-md bg-secondary/40 px-2.5 py-1.5'

  let status   = $state<SystemStatus | null>(null)
  let loading  = $state(true)
  let refreshing = $state(false)
  let error    = $state('')

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

  // ── Boot time (loaded once) ───────────────────────────────────────────────
  let bootTime      = $state<BootTime | null>(null)
  let bootTimeError = $state('')

  async function loadBootTime() {
    try { bootTime = await invoke<BootTime>('system:bootTime') }
    catch (e) { bootTimeError = String(e) }
  }

  // ── Kernel tuning (sysctl) — Advanced disclosure ──────────────────────────
  let sysctl        = $state<Record<string, number> | null>(null)
  let sysctlDraft    = $state<Record<string, number>>({})
  let sysctlSaving   = $state<string | null>(null)
  let sysctlSaved    = $state<string | null>(null)
  let sysctlError    = $state('')

  async function loadSysctl() {
    try {
      sysctl = await invoke<Record<string, number>>('system:sysctl')
      sysctlDraft = { ...sysctl }
      sysctlError = ''
    } catch (e) { sysctlError = String(e) }
  }

  async function saveSysctl(key: string, label: string) {
    sysctlSaving = key; sysctlSaved = null
    const value = sysctlDraft[key]
    try {
      await invoke('system:setSysctl', key, value)
      await loadSysctl()
      sysctlSaved = key
      setTimeout(() => { if (sysctlSaved === key) sysctlSaved = null }, 2000)
      toasts.success(`${label} set to ${value}`, 'System info')
    } catch (e) {
      toasts.error(String(e), 'System info')
    } finally { sysctlSaving = null }
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
    if (pct >= 90) return 'bg-status-fail'
    if (pct >= 70) return 'bg-status-warn'
    return 'bg-primary'
  }

  function usageText(pct: number): string {
    if (pct >= 90) return 'text-status-fail'
    if (pct >= 70) return 'text-status-warn'
    return 'text-foreground/80'
  }

  function sparkColor(pct: number): string {
    if (pct >= 90) return 'hsl(var(--status-fail))'
    if (pct >= 70) return 'hsl(var(--status-warn))'
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

  function fmtDur(secs: number | null): string {
    if (secs == null) return '—'
    if (secs >= 60) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
    return `${secs.toFixed(1)}s`
  }

  onMount(() => {
    void load(); void loadSpecs(); void loadBootTime(); void loadSysctl()
  })

  // Only the active panel polls; history is kept so graphs persist across leave/return.
  $effect(() => {
    if (!visible) return
    const id = setInterval(() => { void load(true) }, 5000)
    return () => clearInterval(id)
  })

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

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh system status"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-14 w-full" />
      <Skeleton class="h-28 w-full" />
      <div class="grid grid-cols-3 gap-3">
        {#each [0, 1, 2] as i (i)}
          <Skeleton class="h-16 w-full" />
        {/each}
      </div>
      <Skeleton class="h-44 w-full" />
      <Skeleton class="h-32 w-full" />

    {:else if status}
      {@const memPct = Math.round(status.memory.used / status.memory.total * 100)}
      {@const cpuHistory = history.map(h => h.cpu)}
      {@const memHistory = history.map(h => h.mem)}

      <!-- Header banner -->
      <Card padding="none" class="px-4 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Server size={15} />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold leading-tight truncate">{status.hostname}</p>
          <p class="text-xs text-muted-foreground leading-tight">{status.osName}</p>
        </div>
      </Card>

      <!-- Machine identity -->
      {#if specs}
        <Card>
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
              <CircuitBoard size={15} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-medium leading-tight">
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
        </Card>
      {:else if specsError}
        <Alert message={specsError} />
      {/if}

      <!-- Info row -->
      <div class="grid grid-cols-3 gap-3">
        <Card padding="sm" class="flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-md bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
            <Layers size={13} />
          </div>
          <div class="min-w-0">
            <p class={labelCls}>Kernel</p>
            <p class="text-[13px] font-medium truncate leading-tight mt-0.5">{status.kernel}</p>
            <p class="text-xs text-muted-foreground">{status.arch}</p>
          </div>
        </Card>
        <Card padding="sm" class="flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
            <Clock size={13} />
          </div>
          <div>
            <p class={labelCls}>Uptime</p>
            <p class="text-[13px] font-medium leading-tight mt-0.5">{uptimeStr(status.uptime)}</p>
          </div>
        </Card>
        <Card padding="sm" class="flex items-start gap-2.5">
          <div class="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Activity size={13} />
          </div>
          <div>
            <p class={labelCls}>Processes</p>
            <p class="text-[13px] font-medium leading-tight mt-0.5">{status.processes}</p>
            <p class="text-xs text-muted-foreground">running</p>
          </div>
        </Card>
      </div>

      <!-- CPU -->
      <Card class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Cpu size={16} />
            </div>
            <div class="min-w-0">
              <p class="text-[13px] font-medium truncate">{status.cpu.model}</p>
              <p class="text-xs text-muted-foreground">
                {#if specs}
                  {specs.cpu.vendor ? specs.cpu.vendor + ' · ' : ''}{specs.cpu.sockets > 1 ? `${specs.cpu.sockets} sockets · ` : ''}{specs.cpu.coresPerSocket || status.cpu.cores} cores · {specs.cpu.totalThreads || status.cpu.cores} threads
                {:else}
                  {status.cpu.cores} logical cores
                {/if}
              </p>
            </div>
          </div>
          <span class="text-2xl font-semibold tabular-nums shrink-0">{status.cpu.usage}%</span>
        </div>

        {#if specs}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div class={statCls}>
              <p class={labelCls}>Base / Max</p>
              <p class="text-xs font-medium tabular-nums mt-0.5">{fmtGhz(specs.cpu.minMhz)} – {fmtGhz(specs.cpu.maxMhz)}</p>
            </div>
            <div class={statCls}>
              <p class={labelCls}>L2 / L3 Cache</p>
              <p class="text-xs font-medium tabular-nums mt-0.5">{fmtCache(specs.cpu.caches.l2)} / {fmtCache(specs.cpu.caches.l3)}</p>
            </div>
            <div class={statCls}>
              <p class={labelCls}>L1 Cache</p>
              <p class="text-xs font-medium tabular-nums mt-0.5">{fmtCache(specs.cpu.caches.l1d)} d / {fmtCache(specs.cpu.caches.l1i)} i</p>
            </div>
            <div class={statCls}>
              <p class={labelCls}>Virtualization</p>
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
              aria-hidden="true"
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
            <span class="absolute bottom-1 right-2 text-[11px] text-muted-foreground">5 min</span>
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
          {#each [['1m', status.load.one], ['5m', status.load.five], ['15m', status.load.fifteen]] as [label, val] (label)}
            <div class="{statCls} flex items-center justify-between">
              <span class="text-[11px] text-muted-foreground">Load {label}</span>
              <span class="text-xs font-medium tabular-nums">{(val as number).toFixed(2)}</span>
            </div>
          {/each}
        </div>

        <!-- Per-core grid -->
        {#if status.cpu.coreUsages && status.cpu.coreUsages.length > 0}
          <div class="border-t border-border pt-3">
            <p class="{labelCls} font-medium mb-2">Per-core</p>
            <div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fill, minmax(58px, 1fr))">
              {#each status.cpu.coreUsages as pct, i (i)}
                <div class="rounded-md bg-secondary/40 p-1.5 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] text-muted-foreground font-medium">C{i}</span>
                    <span class="text-[11px] font-semibold tabular-nums {usageText(pct)}">{pct}%</span>
                  </div>
                  <div class="h-[3px] rounded-full bg-secondary overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500 {usageColor(pct)}"
                         style="width: {pct}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </Card>

      <!-- Graphics -->
      {#if specs && specs.gpus.length > 0}
        <Card class="space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-primary/10 text-primary">
                <MonitorPlay size={16} />
              </div>
              <p class="text-[13px] font-medium">Graphics</p>
            </div>
            {#if status.gpu && status.gpu.busyPct != null}
              <span class="text-2xl font-semibold tabular-nums">{status.gpu.busyPct}%</span>
            {/if}
          </div>

          {#if status.gpu && status.gpu.busyPct != null}
            <div class="h-2 rounded-full bg-secondary overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500 {usageColor(status.gpu.busyPct)}"
                   style="width: {status.gpu.busyPct}%"></div>
            </div>
            <div class="flex justify-between text-[11px] text-muted-foreground">
              <span>{status.gpu.vendor} GPU</span>
              {#if status.gpu.curMhz}
                <span>{status.gpu.curMhz} / {status.gpu.maxMhz} MHz</span>
              {/if}
              {#if status.gpu.memUsed != null && status.gpu.memTotal != null}
                <span>{fmt(status.gpu.memUsed)} / {fmt(status.gpu.memTotal)} VRAM</span>
              {/if}
            </div>
          {/if}

          <div class="space-y-1.5">
            {#each specs.gpus as gpu, i (i)}
              <div class="rounded-md bg-secondary/40 px-3 py-2 flex items-center justify-between gap-3">
                <span class="text-xs font-medium truncate">{gpu.description}</span>
                {#if gpu.driver}
                  <span class="text-[11px] font-mono text-muted-foreground shrink-0">{gpu.driver}</span>
                {/if}
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- Memory -->
      <Card class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-primary/10 text-primary">
              <MemoryStick size={16} />
            </div>
            <div>
              <p class="text-[13px] font-medium">Memory</p>
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
              aria-hidden="true"
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
            <span class="absolute bottom-1 right-2 text-[11px] text-muted-foreground">5 min</span>
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
            <Button
              variant="ghost"
              size="sm"
              class="-ml-2.5 text-muted-foreground hover:text-foreground"
              disabled={memLoading}
              onclick={loadMemoryDetails}
            >
              {#if memLoading}
                <RefreshCw size={12} class="animate-spin" />
                Reading memory modules…
              {:else}
                <Eye size={12} />
                Show memory module details
              {/if}
            </Button>
            {#if memError}
              <p class="text-[11px] text-destructive mt-1.5">{memError}</p>
            {/if}
          {:else}
            <div class="flex items-center justify-between mb-2">
              <p class="{labelCls} font-medium">
                Memory modules ({memDetails.slotsUsed}{memDetails.slotsTotal ? ` of ${memDetails.slotsTotal}` : ''} slots)
              </p>
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-foreground"
                onclick={() => memDetails = null}
              >
                <ChevronDown size={11} />
                Hide
              </Button>
            </div>
            {#if memDetails.dimms.length > 0}
              <div class="space-y-1.5">
                {#each memDetails.dimms as dimm, i (i)}
                  <div class="rounded-md bg-secondary/40 px-3 py-2 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs font-medium truncate">{dimm.locator}</p>
                      <p class="text-[11px] text-muted-foreground truncate">{dimm.manufacturer || 'Unknown'}{dimm.partNumber ? ` · ${dimm.partNumber}` : ''}</p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-xs font-medium tabular-nums">{dimm.size}</p>
                      <p class="text-[11px] text-muted-foreground">{dimm.type}{dimm.speed ? ` · ${dimm.speed}` : ''}</p>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-[11px] text-muted-foreground">No memory module details available</p>
            {/if}
          {/if}
        </div>
      </Card>

      <!-- Swap -->
      {#if status.memory.swapTotal > 0}
        {@const swapPct = Math.round(status.memory.swapUsed / status.memory.swapTotal * 100)}
        <Card class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-secondary text-muted-foreground">
                <Server size={16} />
              </div>
              <div>
                <p class="text-[13px] font-medium">Swap</p>
                <p class="text-xs text-muted-foreground">{fmt(status.memory.swapUsed)} used of {fmt(status.memory.swapTotal)}</p>
              </div>
            </div>
            <span class="text-2xl font-semibold tabular-nums">{swapPct}%</span>
          </div>
          <div class="h-2 rounded-full bg-secondary overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500 {usageColor(swapPct)}"
                 style="width: {swapPct}%"></div>
          </div>
        </Card>
      {/if}

      <!-- Boot time -->
      {#if bootTime}
        <Card class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-primary/10 text-primary">
                <Timer size={16} />
              </div>
              <p class="text-[13px] font-medium">Boot Time</p>
            </div>
            <span class="text-2xl font-semibold tabular-nums">{fmtDur(bootTime.totalSeconds)}</span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            {#each [['Firmware', bootTime.firmware], ['Loader', bootTime.loader], ['Kernel', bootTime.kernel], ['Userspace', bootTime.userspace]] as [label, val] (label)}
              <div class="rounded-md bg-secondary/40 px-2 py-1.5 text-center">
                <p class={labelCls}>{label}</p>
                <p class="text-xs font-medium tabular-nums mt-0.5">{fmtDur(val as number | null)}</p>
              </div>
            {/each}
          </div>
          {#if bootTime.slowest.length > 0}
            <div class="border-t border-border pt-3">
              <p class="{labelCls} font-medium mb-2">Slowest starting units</p>
              <div class="space-y-1">
                {#each bootTime.slowest.slice(0, 5) as unit, i (i)}
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-muted-foreground truncate">{unit.unit}</span>
                    <span class="font-medium tabular-nums shrink-0 ml-2">{unit.time}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </Card>
      {:else if bootTimeError}
        <Alert message={bootTimeError} />
      {/if}

      <!-- Advanced — kernel tuning (closed by default) -->
      {#if sysctl || sysctlError}
        <Card padding="none">
          <details class="group">
            <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none rounded-xl [&::-webkit-details-marker]:hidden">
              <div class="p-2 rounded-lg bg-secondary text-muted-foreground shrink-0">
                <SlidersHorizontal size={16} />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium">Advanced — kernel tuning</p>
                <p class="text-xs text-muted-foreground">sysctl values; applied immediately and persisted in /etc/sysctl.d</p>
              </div>
              <ChevronDown size={14} class="text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div class="px-4 pb-4 pt-3 border-t border-border/60 space-y-2.5">
              {#if sysctlError}
                <Alert message={sysctlError} />
              {/if}
              {#if sysctl}
                {#each TUNABLES as tunable (tunable.key)}
                  <div class="flex items-center gap-3">
                    <div class="flex-1 min-w-0">
                      <label for="sysctl-{tunable.key}" class="text-xs font-medium">{tunable.label}</label>
                      <p class="text-[11px] text-muted-foreground">{tunable.hint}</p>
                    </div>
                    <input
                      id="sysctl-{tunable.key}"
                      type="number"
                      min="0"
                      bind:value={sysctlDraft[tunable.key]}
                      class="w-16 px-2 py-1 rounded-md border border-border bg-secondary/50 text-xs font-mono text-right focus:outline-none"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      class="w-16"
                      disabled={sysctlSaving === tunable.key || sysctlDraft[tunable.key] === sysctl?.[tunable.key]}
                      onclick={() => saveSysctl(tunable.key, tunable.label)}
                    >
                      {#if sysctlSaving === tunable.key}
                        <RefreshCw size={11} class="animate-spin" />
                      {:else if sysctlSaved === tunable.key}
                        <Check size={11} class="text-status-ok" />
                      {:else}
                        Apply
                      {/if}
                    </Button>
                  </div>
                {/each}
              {/if}
            </div>
          </details>
        </Card>
      {/if}

      <!-- AI diagnostics (closed by default, last) -->
      <Card padding="none">
        <details class="group">
          <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none rounded-xl [&::-webkit-details-marker]:hidden">
            <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles size={16} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-medium">Ask AI why something's off</p>
              <p class="text-xs text-muted-foreground">Diagnose with live system data</p>
            </div>
            <ChevronDown size={14} class="text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div class="px-4 pb-4 pt-3 border-t border-border/60 space-y-3">
            <form
              class="flex items-center gap-2"
              onsubmit={(e) => { e.preventDefault(); askAi() }}
            >
              <input
                type="text"
                bind:value={aiQuery}
                disabled={aiAsking}
                aria-label="Question for AI diagnostics"
                placeholder="e.g. why is my system running slow?"
                class="flex-1 min-w-0 text-xs px-3 py-2 rounded-md bg-secondary/40 border border-border
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary
                       disabled:opacity-50"
              />
              <Button type="submit" variant="secondary" size="sm" loading={aiAsking} disabled={!aiQuery.trim()}>
                {#if !aiAsking}<Send size={12} />{/if}
                Ask
              </Button>
            </form>

            {#if aiError}
              <Alert message={aiError} />
            {:else if aiAnswer}
              <div class="rounded-lg bg-secondary/40 p-3 space-y-2">
                <p class="text-xs leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
                {#if aiTools.length > 0}
                  <div class="flex flex-wrap gap-1.5 pt-1 border-t border-border/60">
                    {#each aiTools as tool (tool)}
                      <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{tool}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </details>
      </Card>
    {/if}
  </div>
</Page>
