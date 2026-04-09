<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { invoke } from '$lib/utils'
  import { streamStore } from '$stores/stream'
  import { BatteryCharging, Battery, BatteryWarning } from 'lucide-svelte'

  type BatteryStatus = {
    capacity: number
    status: string
    health: string
    threshold: number
    hasThreshold: boolean
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
      // untrack history read so writing it doesn't re-trigger this effect
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

      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="rounded-lg bg-secondary/50 p-3">
          <p class="text-muted-foreground text-xs mb-1">Health</p>
          <p class="font-medium">{info.health || '—'}</p>
        </div>
        <div class="rounded-lg bg-secondary/50 p-3">
          <p class="text-muted-foreground text-xs mb-1">Charge limit</p>
          <p class="font-medium">{info.threshold}%</p>
        </div>
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
