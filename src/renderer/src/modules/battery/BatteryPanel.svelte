<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { subscribeStream } from '$stores/stream'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, EmptyState } from '$ui'
  import { BatteryCharging, Battery, BatteryWarning, Clock, Zap, RotateCw, Gauge, RefreshCw } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type BatteryStatus = {
    capacity: number
    status: string
    health: string
    threshold: number
    hasThreshold: boolean
    powerNow: number
    timeRemaining: number | null
    cycleCount: number
    wearLevel: number | null
    energyFull: number
    energyFullDesign: number
  }
  type BatteryFrame = { timestamp: number; capacity: number; status: string }

  const TITLE = 'Battery'
  const labelCls = 'text-[11px] text-muted-foreground uppercase tracking-wide'

  let info = $state<BatteryStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let thresholdInput = $state(80)
  let saving = $state(false)
  let error = $state('')

  // Live battery stream for the history chart — only the active panel subscribes;
  // history is kept so the chart persists across leave/return.
  let history = $state<{ t: number; v: number }[]>([])

  $effect(() => {
    if (!visible) return
    return subscribeStream<BatteryFrame>('battery', (frame) => {
      if (frame.timestamp > 0) {
        history = [...history.slice(-59), { t: frame.timestamp, v: frame.capacity }]
      }
    })
  })

  async function load(force = false): Promise<void> {
    if (force) refreshing = true
    error = ''
    try {
      info = await invoke<BatteryStatus>('battery:status')
      if (info) thresholdInput = info.threshold
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
      refreshing = false
    }
  }

  async function setThreshold(): Promise<void> {
    saving = true
    try {
      await invoke('battery:setThreshold', thresholdInput)
      toasts.success(`Charge limit set to ${thresholdInput}%`, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      saving = false
    }
  }

  onMount(() => { void load() })

  function batteryIcon(status: string, capacity: number) {
    if (status === 'Charging') return BatteryCharging
    if (capacity < 15) return BatteryWarning
    return Battery
  }

  function statusColor(status: string) {
    if (status === 'Charging') return 'text-primary'
    if (status === 'Full') return 'text-status-ok'
    return 'text-foreground'
  }

  function barColor(pct: number) {
    if (pct <= 15) return 'bg-status-fail'
    if (pct <= 30) return 'bg-status-warn'
    return 'bg-primary'
  }

  function wearColor(pct: number) {
    if (pct > 50) return 'text-status-fail'
    if (pct > 20) return 'text-status-warn'
    return 'text-status-ok'
  }

  function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh battery status"
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
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-32 w-full" />

    {:else if !info}
      <EmptyState icon={Battery} title="No battery found" message="This system does not report a battery." />

    {:else}
      {@const Icon = batteryIcon(info.status, info.capacity)}

      <!-- Main charge card -->
      <Card class="p-5 space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-4xl font-bold tabular-nums">{info.capacity}<span class="text-xl text-muted-foreground">%</span></p>
            <p class="text-[13px] {statusColor(info.status)} mt-1">{info.status}</p>
          </div>
          <Icon size={32} class="text-muted-foreground" />
        </div>

        <!-- Charge bar -->
        <div class="h-2 rounded-full bg-secondary overflow-hidden">
          <div class="{barColor(info.capacity)} h-full rounded-full transition-all duration-500"
               style="width: {info.capacity}%"></div>
        </div>

        {#if info.timeRemaining !== null}
          <div class="flex items-center gap-2 text-[13px]">
            <Clock size={14} class="text-muted-foreground" />
            <span class="text-muted-foreground">
              {#if info.status === 'Charging'}
                {formatTime(info.timeRemaining)} until full
              {:else if info.status === 'Discharging'}
                {formatTime(info.timeRemaining)} remaining
              {:else}
                {formatTime(info.timeRemaining)}
              {/if}
            </span>
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-secondary/40 p-3 flex items-start gap-2.5">
            <div class="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Gauge size={11} />
            </div>
            <div>
              <p class={labelCls}>Health</p>
              <p class="font-medium text-[13px] mt-0.5">{info.health || '—'}</p>
            </div>
          </div>
          <div class="rounded-lg bg-secondary/40 p-3 flex items-start gap-2.5">
            <div class="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Zap size={11} />
            </div>
            <div>
              <p class={labelCls}>Charge limit</p>
              <p class="font-medium text-[13px] mt-0.5">{info.threshold}%</p>
            </div>
          </div>
        </div>

        <!-- Extended stats -->
        <div class="grid grid-cols-3 gap-2">
          <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
            <span class="text-[11px] text-muted-foreground flex items-center gap-1">
              <Zap size={10} /> Power
            </span>
            <span class="text-xs font-medium tabular-nums">{info.powerNow}W</span>
          </div>
          <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
            <span class="text-[11px] text-muted-foreground flex items-center gap-1">
              <RotateCw size={10} /> Cycles
            </span>
            <span class="text-xs font-medium tabular-nums">{info.cycleCount.toLocaleString()}</span>
          </div>
          {#if info.wearLevel !== null}
            <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
              <span class="text-[11px] text-muted-foreground flex items-center gap-1">
                <Gauge size={10} /> Wear
              </span>
              <span class="text-xs font-medium tabular-nums {wearColor(info.wearLevel)}">{info.wearLevel}%</span>
            </div>
          {/if}
        </div>
      </Card>

      <!-- Charge threshold control (privileged write → explicit Apply, one polkit prompt) -->
      {#if info.hasThreshold}
        <Card class="p-5 space-y-3">
          <label for="battery-threshold" class="text-[13px] font-medium">Charge threshold</label>
          <p class="text-xs text-muted-foreground">Stop charging at this percentage to extend battery lifespan.</p>

          <div class="flex items-center gap-3">
            <input
              id="battery-threshold"
              type="range" min="50" max="100" step="5"
              bind:value={thresholdInput}
              class="flex-1 accent-primary"
            />
            <span class="text-[13px] font-mono w-10 text-right tabular-nums">{thresholdInput}%</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={thresholdInput === info.threshold}
            onclick={setThreshold}
          >
            Apply
          </Button>
        </Card>
      {/if}

      <!-- History sparkline -->
      {#if history.length > 1}
        <Card class="p-5">
          <p class="text-[13px] font-medium mb-3">Charge history</p>
          <svg viewBox="0 0 400 60" class="w-full text-primary" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={history.map((h, i) => `${(i / (history.length - 1)) * 400},${60 - h.v * 0.6}`).join(' ')}
              fill="none" stroke="currentColor" stroke-width="1.5"
            />
          </svg>
        </Card>
      {/if}
    {/if}
  </div>
</Page>
