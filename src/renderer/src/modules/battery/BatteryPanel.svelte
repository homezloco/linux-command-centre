<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { invoke } from '$lib/utils'
  import { streamStore } from '$stores/stream'
  import { BatteryCharging, Battery, BatteryWarning, Clock, Zap, RotateCw, Gauge } from 'lucide-svelte'

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

  let info = $state<BatteryStatus | null>(null)
  let loading = $state(true)
  let thresholdInput = $state(80)
  let saving = $state(false)
  let error = $state('')

  // Live battery stream for history chart
  const stream = streamStore<BatteryFrame>('battery', { timestamp: 0, capacity: 0, status: '' })
  let history = $state<{ t: number; v: number }[]>([])

  $effect(() => {
    const frame = $stream
    if (frame.timestamp > 0) {
      history = [...untrack(() => history).slice(-59), { t: frame.timestamp, v: frame.capacity }]
    }
  })

  async function load(): Promise<void> {
    loading = true
    error = ''
    try {
      info = await invoke<BatteryStatus>('battery:status')
      if (info) thresholdInput = info.threshold
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  async function setThreshold(): Promise<void> {
    saving = true
    error = ''
    try {
      await invoke('battery:setThreshold', thresholdInput)
      await load()
    } catch (e) {
      error = String(e)
    } finally {
      saving = false
    }
  }

  onMount(load)

  function batteryIcon(status: string, capacity: number) {
    if (status === 'Charging') return BatteryCharging
    if (capacity < 15) return BatteryWarning
    return Battery
  }

  function statusColor(status: string) {
    if (status === 'Charging') return 'text-blue-400'
    if (status === 'Full') return 'text-green-400'
    return 'text-foreground'
  }

  function barColor(pct: number) {
    if (pct <= 15) return 'bg-red-500'
    if (pct <= 30) return 'bg-yellow-500'
    return 'bg-primary'
  }

  function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
{:else if !info}
  <div class="text-muted-foreground text-sm">No battery found.</div>
{:else}
  {@const Icon = batteryIcon(info.status, info.capacity)}
  <div class="space-y-4 max-w-lg">

    <!-- Main charge card -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-4xl font-bold tabular-nums">{info.capacity}<span class="text-xl text-muted-foreground">%</span></p>
          <p class="text-sm {statusColor(info.status)} mt-1">{info.status}</p>
        </div>
        <Icon size={32} class="text-muted-foreground" />
      </div>

      <!-- Charge bar -->
      <div class="h-2 rounded-full bg-secondary overflow-hidden">
        <div class="{barColor(info.capacity)} h-full rounded-full transition-all duration-500"
             style="width: {info.capacity}%"></div>
      </div>

      <!-- Time/Power Row -->
      {#if info.timeRemaining !== null}
        <div class="flex items-center gap-2 text-sm">
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

      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-lg bg-secondary/40 p-3 flex items-start gap-2.5">
          <div class="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Gauge size={11} />
          </div>
          <div>
            <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Health</p>
            <p class="font-medium text-sm mt-0.5">{info.health || '—'}</p>
          </div>
        </div>
        <div class="rounded-lg bg-secondary/40 p-3 flex items-start gap-2.5">
          <div class="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Zap size={11} />
          </div>
          <div>
            <p class="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Charge limit</p>
            <p class="font-medium text-sm mt-0.5">{info.threshold}%</p>
          </div>
        </div>
      </div>

      <!-- Extended stats -->
      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
          <span class="text-[10px] text-muted-foreground flex items-center gap-1">
            <Zap size={10} /> Power
          </span>
          <span class="text-xs font-medium">{info.powerNow}W</span>
        </div>
        <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
          <span class="text-[10px] text-muted-foreground flex items-center gap-1">
            <RotateCw size={10} /> Cycles
          </span>
          <span class="text-xs font-medium">{info.cycleCount.toLocaleString()}</span>
        </div>
        {#if info.wearLevel !== null}
          <div class="rounded-md bg-secondary/30 px-2.5 py-2 flex items-center justify-between">
            <span class="text-[10px] text-muted-foreground flex items-center gap-1">
              <Gauge size={10} /> Wear
            </span>
            <span class="text-xs font-medium {info.wearLevel > 50 ? 'text-red-400' : info.wearLevel > 20 ? 'text-yellow-400' : 'text-green-400'}">{info.wearLevel}%</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Charge threshold control -->
    {#if info.hasThreshold}
    <div class="rounded-xl border border-border bg-card p-5 space-y-3">
      <p class="text-sm font-medium">Charge threshold</p>
      <p class="text-xs text-muted-foreground">Stop charging at this percentage to extend battery lifespan.</p>

      <div class="flex items-center gap-3">
        <input
          type="range" min="50" max="100" step="5"
          bind:value={thresholdInput}
          class="flex-1 accent-primary"
        />
        <span class="text-sm font-mono w-10 text-right">{thresholdInput}%</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          onclick={setThreshold}
          disabled={saving}
          class="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium
                 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Apply'}
        </button>
        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}
      </div>
    </div>
    {/if}

    <!-- History sparkline -->
    {#if history.length > 1}
    <div class="rounded-xl border border-border bg-card p-5">
      <p class="text-sm font-medium mb-3">Charge history</p>
      <svg viewBox="0 0 400 60" class="w-full text-primary" preserveAspectRatio="none">
        <polyline
          points={history.map((h, i) => `${(i / (history.length - 1)) * 400},${60 - h.v * 0.6}`).join(' ')}
          fill="none" stroke="currentColor" stroke-width="1.5"
        />
      </svg>
    </div>
    {/if}

  </div>
{/if}
