<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Cpu, MemoryStick, RefreshCw, Server, Clock, Activity, Layers } from 'lucide-svelte'

  type SystemStatus = {
    hostname: string
    osName: string
    kernel: string
    arch: string
    uptime: { days: number; hours: number; minutes: number; totalSeconds: number }
    cpu: { model: string; cores: number; usage: number }
    memory: { total: number; used: number; available: number; swapTotal: number; swapUsed: number }
    load: { one: number; five: number; fifteen: number }
    processes: number
  }

  let status = $state<SystemStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let interval: ReturnType<typeof setInterval> | undefined

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      status = await invoke<SystemStatus>('system:status')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
    if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  function usageColor(pct: number): string {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 70) return 'bg-yellow-500'
    return 'bg-primary'
  }

  function uptimeStr(u: SystemStatus['uptime']): string {
    const parts: string[] = []
    if (u.days > 0) parts.push(`${u.days}d`)
    if (u.hours > 0) parts.push(`${u.hours}h`)
    parts.push(`${u.minutes}m`)
    return parts.join(' ')
  }

  onMount(() => {
    load()
    interval = setInterval(() => load(true), 5000)
  })
  onDestroy(() => clearInterval(interval))
</script>

<!-- Loading -->
{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

<!-- Error -->
{:else if error}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if status}
  <div class="space-y-4 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold">{status.hostname}</h2>
        <p class="text-xs text-muted-foreground">{status.osName}</p>
      </div>
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

    <!-- Info row -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground">
          <Layers size={13} />
          <span class="text-xs">Kernel</span>
        </div>
        <p class="text-sm font-medium truncate">{status.kernel}</p>
        <p class="text-xs text-muted-foreground">{status.arch}</p>
      </div>
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground">
          <Clock size={13} />
          <span class="text-xs">Uptime</span>
        </div>
        <p class="text-sm font-medium">{uptimeStr(status.uptime)}</p>
        <p class="text-xs text-muted-foreground">&nbsp;</p>
      </div>
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground">
          <Activity size={13} />
          <span class="text-xs">Processes</span>
        </div>
        <p class="text-sm font-medium">{status.processes}</p>
        <p class="text-xs text-muted-foreground">running</p>
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
      <div class="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500 {usageColor(status.cpu.usage)}"
          style="width: {status.cpu.usage}%"
        ></div>
      </div>
      <!-- Load averages -->
      <div class="flex gap-4 text-xs text-muted-foreground">
        <span>Load 1m: <span class="text-foreground font-medium">{status.load.one.toFixed(2)}</span></span>
        <span>5m: <span class="text-foreground font-medium">{status.load.five.toFixed(2)}</span></span>
        <span>15m: <span class="text-foreground font-medium">{status.load.fifteen.toFixed(2)}</span></span>
      </div>
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
        <span class="text-2xl font-semibold tabular-nums">
          {Math.round(status.memory.used / status.memory.total * 100)}%
        </span>
      </div>
      <div class="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500 {usageColor(Math.round(status.memory.used / status.memory.total * 100))}"
          style="width: {Math.round(status.memory.used / status.memory.total * 100)}%"
        ></div>
      </div>
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
          <div
            class="h-full rounded-full transition-all duration-500 {usageColor(swapPct)}"
            style="width: {swapPct}%"
          ></div>
        </div>
      </div>
    {/if}

  </div>
{/if}
