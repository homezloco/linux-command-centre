<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Cpu, MemoryStick, RefreshCw, Server, Clock, Activity, Layers } from 'lucide-svelte'
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

  onMount(() => { load(); interval = setInterval(() => load(true), 5000) })
  onDestroy(() => clearInterval(interval))
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
            <p class="text-xs text-muted-foreground">{status.cpu.cores} logical cores</p>
          </div>
        </div>
        <span class="text-2xl font-semibold tabular-nums">{status.cpu.usage}%</span>
      </div>

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
