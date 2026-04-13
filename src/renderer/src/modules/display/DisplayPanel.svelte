<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Sun, Moon, Monitor, ChevronDown, Maximize, Star } from 'lucide-svelte'

  type DisplayMode = {
    resolution: string
    refreshRate: number
    isCurrent: boolean
    isPreferred: boolean
  }

  type Monitor = {
    name: string
    resolution: string
    refreshRate: number
    primary: boolean
    modes: DisplayMode[]
  }

  type DisplayStatus = {
    brightness: number | null
    nightLight: boolean
    nightLightTemp: number
    monitors: Monitor[]
    fractionalScale: number
  }

  let status = $state<DisplayStatus | null>(null)
  let loading = $state(true)
  let error = $state('')

  // Monitor config state
  let selectedResolutions = $state<Record<string, string>>({})
  let selectedRates = $state<Record<string, number>>({})

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<DisplayStatus>('display:status')
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setBrightness(v: number) {
    if (!status) return
    status = { ...status, brightness: v }
    try { await invoke('display:setBrightness', v) }
    catch (e) { error = String(e) }
  }

  async function toggleNightLight() {
    if (!status) return
    const next = !status.nightLight
    status = { ...status, nightLight: next }
    try { await invoke('display:setNightLight', next) }
    catch (e) { error = String(e); await load() }
  }

  async function setNightLightTemp(v: number) {
    if (!status) return
    status = { ...status, nightLightTemp: v }
    try { await invoke('display:setNightLightTemp', v) }
    catch (e) { error = String(e) }
  }

  async function setResolution(monitor: string, resolution: string, rate?: number) {
    try {
      await invoke('display:setResolution', monitor, resolution, rate)
      await load()
    } catch (e) { error = String(e) }
  }

  async function setScale(scale: number) {
    try {
      await invoke('display:setScale', scale)
      if (status) status = { ...status, fractionalScale: scale }
    } catch (e) { error = String(e) }
  }

  function getUniqueResolutions(modes: DisplayMode[]) {
    const seen = new Set<string>()
    return modes.filter(m => {
      if (seen.has(m.resolution)) return false
      seen.add(m.resolution)
      return true
    })
  }

  function getRatesForResolution(modes: DisplayMode[], resolution: string) {
    return modes.filter(m => m.resolution === resolution).map(m => m.refreshRate)
  }

  onMount(load)
</script>

<div class="max-w-lg space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}

    <!-- Monitors -->
    {#if status.monitors.length > 0}
      <div class="space-y-2">
        {#each status.monitors as monitor}
          {@const selectedRes = selectedResolutions[monitor.name] || monitor.resolution}
          {@const availableRates = getRatesForResolution(monitor.modes, selectedRes)}
          {@const selectedRate = selectedRates[monitor.name] || availableRates[0] || monitor.refreshRate}
          <div class="rounded-xl border border-border bg-card p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Monitor size={16} class="text-muted-foreground" />
                <span class="text-sm font-medium">{monitor.name}</span>
                {#if monitor.primary}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Primary</span>
                {/if}
              </div>
              <button
                onclick={() => setResolution(monitor.name, selectedRes, selectedRate)}
                disabled={selectedRes === monitor.resolution && selectedRate === monitor.refreshRate}
                class="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <!-- Resolution -->
              <div class="space-y-1">
                <label for="res-{monitor.name}" class="text-xs text-muted-foreground">Resolution</label>
                <select
                  id="res-{monitor.name}"
                  value={selectedRes}
                  onchange={(e) => selectedResolutions = { ...selectedResolutions, [monitor.name]: (e.target as HTMLSelectElement).value }}
                  class="w-full text-sm rounded-md border border-border bg-secondary/50 px-2 py-1.5"
                >
                  {#each getUniqueResolutions(monitor.modes) as mode}
                    <option value={mode.resolution}>
                      {mode.resolution} {mode.isPreferred ? '★' : ''}
                    </option>
                  {/each}
                </select>
              </div>

              <!-- Refresh Rate -->
              <div class="space-y-1">
                <label for="rate-{monitor.name}" class="text-xs text-muted-foreground">Refresh Rate</label>
                <select
                  id="rate-{monitor.name}"
                  value={selectedRate}
                  onchange={(e) => selectedRates = { ...selectedRates, [monitor.name]: parseFloat((e.target as HTMLSelectElement).value) }}
                  class="w-full text-sm rounded-md border border-border bg-secondary/50 px-2 py-1.5"
                >
                  {#each availableRates as rate}
                    <option value={rate}>{rate.toFixed(1)} Hz</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Scaling -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Maximize size={15} class="text-muted-foreground" />
          Scaling
        </div>
        <span class="text-xs text-muted-foreground">{status.fractionalScale.toFixed(1)}x</span>
      </div>
      <div class="flex gap-2 flex-wrap">
        {#each [1, 1.25, 1.5, 1.75, 2] as scale}
          <button
            onclick={() => setScale(scale)}
            class="px-3 py-1.5 rounded-md text-xs border transition-colors
                   {status.fractionalScale === scale
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-border hover:bg-secondary'}"
          >
            {scale.toFixed(2)}x
          </button>
        {/each}
      </div>
    </div>

    <!-- Brightness -->
    {#if status.brightness !== null}
    <div class="rounded-xl border border-border bg-card p-5 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Sun size={15} />
        Brightness — {status.brightness}%
      </div>
      <input type="range" min="1" max="100" step="1" value={status.brightness}
             oninput={(e) => setBrightness(parseInt((e.target as HTMLInputElement).value))}
             class="w-full accent-primary" />
      <div class="flex justify-between">
        {#each [25, 50, 75, 100] as p}
          <button onclick={() => setBrightness(p)} class="text-xs text-muted-foreground hover:text-foreground transition-colors">{p}%</button>
        {/each}
      </div>
    </div>
    {/if}

    <!-- Night Light -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Moon size={15} />
          Night light
        </div>
        <button onclick={toggleNightLight} aria-label="Toggle night light"
                class="relative w-11 h-6 rounded-full transition-colors {status.nightLight ? 'bg-primary' : 'bg-secondary'}">
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {status.nightLight ? 'translate-x-5' : ''}"></span>
        </button>
      </div>

      {#if status.nightLight}
      <div class="space-y-1.5">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Temperature</span>
          <span>{status.nightLightTemp}K</span>
        </div>
        <input type="range" min="1700" max="4700" step="100" value={status.nightLightTemp}
               oninput={(e) => setNightLightTemp(parseInt((e.target as HTMLInputElement).value))}
               class="w-full accent-primary" />
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Warm</span>
          <span>Cool</span>
        </div>
      </div>
      {/if}
    </div>

    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  {/if}
</div>
