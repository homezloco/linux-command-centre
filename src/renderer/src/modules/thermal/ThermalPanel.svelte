<script lang="ts">
  import { subscribeStream } from '$stores/stream'
  import { invoke, tempColor } from '$lib/utils'
  import { Page, Card, Skeleton } from '$ui'
  import { Wind, Cpu, Thermometer, Activity } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type ProcessInfo = { name: string; pid: number; cpu: number; mem: number }

  // The 'thermal' stream carries sensors only; `thermal:snapshot` (IPC) adds
  // throttling state and top processes, which we poll separately while visible.
  type ThermalSnapshot = {
    timestamp: number
    temps: { label: string; celsius: number }[]
    fans: { label: string; rpm: number }[]
    cpuMinMhz: number
    cpuMaxMhz: number
    turboEnabled: boolean
  }
  type ThermalExtras = {
    throttling: { throttled: boolean; type: string } | null
    processes: ProcessInfo[]
  }

  let snapshot = $state<ThermalSnapshot | null>(null)
  let extras = $state<ThermalExtras | null>(null)
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

  async function loadExtras() {
    try {
      const s = await invoke<ThermalSnapshot & ThermalExtras>('thermal:snapshot')
      extras = { throttling: s.throttling, processes: s.processes ?? [] }
      if (!snapshot) snapshot = s // first paint without waiting on the stream
    } catch { /* keep last */ }
  }

  // Only the active panel subscribes/polls; history persists across leave/return.
  $effect(() => {
    if (!visible) return
    void loadExtras()
    const id = setInterval(() => { void loadExtras() }, 5000)
    const unsubscribe = subscribeStream<ThermalSnapshot>('thermal', (data) => {
      snapshot = data
      const pkg = data.temps.find(t => t.label.toLowerCase().includes('package'))
      if (pkg) {
        history = [...history.slice(-59), { t: data.timestamp, v: pkg.celsius }]
      }
    })
    return () => { clearInterval(id); unsubscribe() }
  })

  function pkgTemp(s: ThermalSnapshot): number {
    return s.temps.find(t => t.label.toLowerCase().includes('package'))?.celsius
        ?? Math.max(...s.temps.map(t => t.celsius))
  }

  function fmtMhz(mhz: number): string {
    return mhz >= 1000 ? (mhz / 1000).toFixed(2) + ' GHz' : mhz + ' MHz'
  }
</script>

<Page width="wide">
  <div class="space-y-4">
    {#if !snapshot}
      <div class="grid grid-cols-3 gap-3">
        {#each [0, 1, 2] as i (i)}
          <Skeleton class="h-24 w-full" />
        {/each}
      </div>
      <Skeleton class="h-36 w-full" />
      <Skeleton class="h-48 w-full" />

    {:else}
      <!-- Top row: package temp + fan + freq -->
      <div class="grid grid-cols-3 gap-3">
        <Card>
          <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Thermometer size={12} /> Package temp
          </div>
          <p class="text-3xl font-bold tabular-nums {tempColor(pkgTemp(snapshot))}">
            {pkgTemp(snapshot).toFixed(1)}<span class="text-base">°C</span>
          </p>
        </Card>

        <Card>
          <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Wind size={12} /> Fan speed
          </div>
          {#if snapshot.fans?.length}
            <p class="text-3xl font-bold tabular-nums">{snapshot.fans[0].rpm.toLocaleString()}<span class="text-base text-muted-foreground"> RPM</span></p>
          {:else}
            <p class="text-[13px] text-muted-foreground mt-2">No fan sensors</p>
          {/if}
        </Card>

        <Card>
          <div class="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Cpu size={12} /> CPU frequency
          </div>
          <p class="text-xl font-bold tabular-nums">{fmtMhz(snapshot.cpuMaxMhz)}</p>
          <p class="text-xs mt-0.5 {snapshot.turboEnabled ? 'text-muted-foreground' : 'text-status-warn'}">
            {snapshot.turboEnabled ? 'Turbo on' : 'Turbo off'}
          </p>
        </Card>
      </div>

      <!-- Package temp graph -->
      {#if history.length > 1}
        <Card>
          <p class="text-[13px] font-medium mb-3">Package temperature — last {history.length}s</p>
          <div class="relative h-24">
            <svg viewBox="0 0 600 96" class="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
              {#each [0.25, 0.5, 0.75] as frac (frac)}
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
            <span class="absolute top-0 right-0 text-[11px] text-muted-foreground tabular-nums">{graphMax.toFixed(0)}°</span>
            <span class="absolute bottom-0 right-0 text-[11px] text-muted-foreground tabular-nums">{graphMin.toFixed(0)}°</span>
          </div>
        </Card>
      {/if}

      <!-- Throttling -->
      {#if extras?.throttling?.throttled}
        <Alert variant="error" message="Thermal throttling active — {extras.throttling.type}" />
      {/if}

      <!-- Top processes -->
      {#if extras && extras.processes.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-[13px] font-medium flex items-center gap-2">
              <Activity size={14} class="text-muted-foreground" />
              Top Processes by CPU
            </p>
          </div>
          <div class="divide-y divide-border">
            {#each extras.processes as proc (proc.pid)}
              <div class="flex items-center justify-between gap-3 px-4 py-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[11px] text-muted-foreground font-mono tabular-nums">{proc.pid}</span>
                  <span class="text-[13px] text-muted-foreground truncate">{proc.name}</span>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="text-xs font-mono tabular-nums">{proc.cpu.toFixed(1)}%</span>
                  <div class="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div class="h-full bg-primary rounded-full" style="width: {Math.min(proc.cpu, 100)}%"></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- All sensors -->
      <Card padding="none" class="overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <p class="text-[13px] font-medium">All sensors</p>
        </div>
        <div class="divide-y divide-border">
          {#each snapshot.temps as temp, i (i)}
            <div class="flex items-center justify-between px-4 py-2">
              <span class="text-[13px] text-muted-foreground">{temp.label}</span>
              <span class="text-[13px] font-mono font-medium tabular-nums {tempColor(temp.celsius)}">
                {temp.celsius.toFixed(1)}°C
              </span>
            </div>
          {/each}
        </div>
      </Card>
    {/if}
  </div>
</Page>
