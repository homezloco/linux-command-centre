<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { subscribeStream } from '$stores/stream'
  import { tempColor } from '$lib/utils'
  import { Wind, Cpu, Thermometer, AlertTriangle, Activity } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'

  type ProcessInfo = { name: string; pid: number; cpu: number; mem: number }

  type ThermalSnapshot = {
    timestamp: number
    temps: { label: string; celsius: number }[]
    fans: { label: string; rpm: number }[]
    cpuMinMhz: number
    cpuMaxMhz: number
    turboEnabled: boolean
    throttling: { throttled: boolean; type: string } | null
    processes: ProcessInfo[]
  }

  let snapshot = $state<ThermalSnapshot | null>(null)
  let history = $state<{ t: number; v: number }[]>([])

  // Graph scale derived from history
  const graphMin = $derived(history.length ? Math.max(0, Math.min(...history.map(h => h.v)) - 5) : 0)
  const graphMax = $derived(history.length ? Math.max(...history.map(h => h.v)) + 5 : 100)
  const graphRange = $derived(graphMax - graphMin || 1)
  const graphPts = $derived(
    history.map((h, i) =>
      `${(i / Math.max(history.length - 1, 1)) * 600},${96 - ((h.v - graphMin) / graphRange) * 96}`
    )
  )
  const graphLastY = $derived(
    history.length ? 96 - ((history[history.length - 1].v - graphMin) / graphRange) * 96 : 96
  )

  const unsub = subscribeStream<ThermalSnapshot>('thermal', (data) => {
    snapshot = data
    const pkg = data.temps.find(t => t.label.toLowerCase().includes('package'))
    if (pkg) {
      history = [...history.slice(-59), { t: data.timestamp, v: pkg.celsius }]
    }
  })

  onDestroy(unsub)

  function pkgTemp(s: ThermalSnapshot): number {
    return s.temps.find(t => t.label.toLowerCase().includes('package'))?.celsius
        ?? Math.max(...s.temps.map(t => t.celsius))
  }
</script>

<div class="space-y-4 max-w-2xl">

  {#if !snapshot}
    <Spinner height="h-48" />
  {:else}

    <!-- Top row: package temp + fan + freq -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Thermometer size={12} /> Package temp
        </div>
        <p class="text-3xl font-bold tabular-nums {tempColor(pkgTemp(snapshot))}">
          {pkgTemp(snapshot).toFixed(1)}<span class="text-base">°C</span>
        </p>
      </div>

      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Wind size={12} /> Fan speed
        </div>
        {#if snapshot.fans.length}
          <p class="text-3xl font-bold tabular-nums">{snapshot.fans[0].rpm.toLocaleString()}<span class="text-base text-muted-foreground"> RPM</span></p>
        {:else}
          <p class="text-sm text-muted-foreground mt-2">No fan sensors</p>
        {/if}
      </div>

      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Cpu size={12} /> CPU frequency
        </div>
        <p class="text-xl font-bold tabular-nums">
          {snapshot.cpuMaxMhz >= 1000
            ? (snapshot.cpuMaxMhz / 1000).toFixed(2) + ' GHz'
            : snapshot.cpuMaxMhz + ' MHz'}
        </p>
        <p class="text-xs text-muted-foreground mt-0.5">
          {snapshot.turboEnabled ? 'Turbo on' : '⚠ Turbo off'}
        </p>
      </div>
    </div>

    <!-- Package temp graph -->
    {#if history.length > 1}
    <div class="rounded-xl border border-border bg-card p-4">
      <p class="text-sm font-medium mb-3">Package temperature — last {history.length}s</p>
      <div class="relative h-24">
        <svg viewBox="0 0 600 96" class="w-full h-full" preserveAspectRatio="none">
          {#each [0.25, 0.5, 0.75] as frac}
            <line x1="0" y1={frac * 96} x2="600" y2={frac * 96}
                  stroke="hsl(var(--border))" stroke-width="0.5" />
          {/each}
          <polyline
            points={[...graphPts, '600,96', '0,96'].join(' ')}
            fill="hsl(var(--primary) / 0.15)" stroke="none"
          />
          <polyline
            points={graphPts.join(' ')}
            fill="none" stroke="hsl(var(--primary))" stroke-width="1.5"
          />
          <circle cx={600} cy={graphLastY} r="3" fill="hsl(var(--primary))" />
        </svg>
        <span class="absolute top-0 right-0 text-[10px] text-muted-foreground">{graphMax.toFixed(0)}°</span>
        <span class="absolute bottom-0 right-0 text-[10px] text-muted-foreground">{graphMin.toFixed(0)}°</span>
      </div>
    </div>
    {/if}

    <!-- Throttling Alert -->
    {#if snapshot.throttling?.throttled}
      <div class="rounded-xl border border-red-400/30 bg-red-400/10 p-4">
        <div class="flex items-center gap-3">
          <AlertTriangle size={20} class="text-red-400" />
          <div>
            <p class="text-sm font-medium text-red-400">Thermal Throttling Active</p>
            <p class="text-xs text-red-400/80">{snapshot.throttling.type}</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Top Processes -->
    {#if snapshot.processes.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <p class="text-sm font-medium flex items-center gap-2">
            <Activity size={14} class="text-muted-foreground" />
            Top Processes by CPU
          </p>
        </div>
        <div class="divide-y divide-border">
          {#each snapshot.processes as proc}
            <div class="flex items-center justify-between px-4 py-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-[10px] text-muted-foreground font-mono">{proc.pid}</span>
                <span class="text-sm text-muted-foreground truncate">{proc.name}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs font-mono">{proc.cpu.toFixed(1)}%</span>
                <div class="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div class="h-full bg-primary rounded-full" style="width: {Math.min(proc.cpu, 100)}%"></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- All sensors table -->
    <div class="rounded-xl border border-border bg-card">
      <div class="px-4 py-3 border-b border-border">
        <p class="text-sm font-medium">All sensors</p>
      </div>
      <div class="divide-y divide-border">
        {#each snapshot.temps as temp}
          <div class="flex items-center justify-between px-4 py-2.5">
            <span class="text-sm text-muted-foreground">{temp.label}</span>
            <span class="text-sm font-mono font-medium {tempColor(temp.celsius)}">
              {temp.celsius.toFixed(1)}°C
            </span>
          </div>
        {/each}
      </div>
    </div>

  {/if}
</div>
