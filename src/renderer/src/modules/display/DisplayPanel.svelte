<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, Listbox, SegmentedControl, EmptyState } from '$ui'
  import { Sun, Moon, Monitor, Maximize, RefreshCw } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type DisplayMode = {
    resolution: string
    refreshRate: number
    isCurrent: boolean
    isPreferred: boolean
  }

  type MonitorInfo = {
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
    monitors: MonitorInfo[]
    fractionalScale: number
  }

  const TITLE = 'Display'
  const SCALES = [1, 1.25, 1.5, 1.75, 2]
  const SCALE_OPTIONS = SCALES.map(s => ({ value: s.toFixed(2), label: `${s.toFixed(2)}×` }))

  let status = $state<DisplayStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let applying = $state<string | null>(null)

  // Monitor mode drafts (resolution + rate is a two-field change → explicit Apply per monitor)
  let selectedResolutions = $state<Record<string, string>>({})
  let selectedRates = $state<Record<string, number>>({})

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<DisplayStatus>('display:status')
      selectedResolutions = {}
      selectedRates = {}
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function fail(e: unknown) {
    toasts.error(String(e), TITLE)
    void load(true)
  }

  const pushBrightness = debounce((v: number) => {
    invoke('display:setBrightness', v).catch(fail)
  })
  function setBrightness(v: number) {
    if (!status) return
    status = { ...status, brightness: v }
    pushBrightness(v)
  }

  async function setNightLight(on: boolean) {
    if (!status) return
    status = { ...status, nightLight: on }
    try { await invoke('display:setNightLight', on) }
    catch (e) { fail(e) }
  }

  const pushNightLightTemp = debounce((v: number) => {
    invoke('display:setNightLightTemp', v).catch(fail)
  })
  function setNightLightTemp(v: number) {
    if (!status) return
    status = { ...status, nightLightTemp: v }
    pushNightLightTemp(v)
  }

  async function applyMode(monitor: string, resolution: string, rate?: number) {
    applying = monitor
    try {
      await invoke('display:setResolution', monitor, resolution, rate)
      toasts.success(`${monitor} set to ${resolution}${rate ? ` @ ${rate.toFixed(1)} Hz` : ''}`, TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { applying = null }
  }

  async function setScale(value: string) {
    const scale = parseFloat(value)
    if (!status || !Number.isFinite(scale)) return
    status = { ...status, fractionalScale: scale }
    try { await invoke('display:setScale', scale) }
    catch (e) { fail(e) }
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
    return [...new Set(modes.filter(m => m.resolution === resolution).map(m => m.refreshRate))]
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh display status"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-20 w-full" />

    {:else if status}
      <!-- Monitors -->
      {#if status.monitors.length === 0}
        <EmptyState icon={Monitor} title="No displays detected" message="Plug in a monitor or check your graphics drivers." />
      {:else}
        <div class="space-y-2">
          {#each status.monitors as monitor (monitor.name)}
            {@const selectedRes = selectedResolutions[monitor.name] || monitor.resolution}
            {@const availableRates = getRatesForResolution(monitor.modes, selectedRes)}
            {@const selectedRate = selectedRates[monitor.name] ?? (availableRates.includes(monitor.refreshRate) ? monitor.refreshRate : availableRates[0])}
            {@const resOptions = getUniqueResolutions(monitor.modes).map(m => ({ value: m.resolution, label: `${m.resolution}${m.isPreferred ? ' ★' : ''}` }))}
            {@const rateOptions = availableRates.map(r => ({ value: String(r), label: `${r.toFixed(1)} Hz` }))}
            {@const unchanged = selectedRes === monitor.resolution && selectedRate === monitor.refreshRate}
            <Card class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <Monitor size={14} />
                  </div>
                  <span class="text-[13px] font-medium truncate">{monitor.name}</span>
                  {#if monitor.primary}
                    <span class="text-[11px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Primary</span>
                  {/if}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={applying === monitor.name}
                  disabled={unchanged}
                  onclick={() => applyMode(monitor.name, selectedRes, selectedRate)}
                >
                  Apply
                </Button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="res-{monitor.name}" class="text-xs text-muted-foreground">Resolution</label>
                  <Listbox
                    id="res-{monitor.name}"
                    value={selectedRes}
                    options={resOptions}
                    onChange={(v) => {
                      selectedResolutions = { ...selectedResolutions, [monitor.name]: v }
                      // A new resolution has its own rate list — drop the stale draft rate
                      const rest = { ...selectedRates }
                      delete rest[monitor.name]
                      selectedRates = rest
                    }}
                  />
                </div>
                <div class="space-y-1">
                  <label for="rate-{monitor.name}" class="text-xs text-muted-foreground">Refresh rate</label>
                  <Listbox
                    id="rate-{monitor.name}"
                    value={String(selectedRate)}
                    options={rateOptions}
                    onChange={(v) => { selectedRates = { ...selectedRates, [monitor.name]: parseFloat(v) } }}
                  />
                </div>
              </div>
            </Card>
          {/each}
        </div>
      {/if}

      <!-- Scaling -->
      <Card class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 text-[13px] font-medium">
            <div class="w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <Maximize size={13} />
            </div>
            Scaling
          </div>
          <span class="text-xs text-muted-foreground tabular-nums">{status.fractionalScale.toFixed(2)}×</span>
        </div>
        <SegmentedControl
          value={status.fractionalScale.toFixed(2)}
          options={SCALE_OPTIONS}
          ariaLabel="Display scaling"
          onChange={(v) => setScale(v)}
        />
      </Card>

      <!-- Brightness -->
      {#if status.brightness !== null}
        <Card class="p-5 space-y-3">
          <label for="display-brightness" class="flex items-center gap-2.5 text-[13px] font-medium">
            <div class="w-7 h-7 rounded-md bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
              <Sun size={13} />
            </div>
            Brightness — <span class="tabular-nums">{status.brightness}%</span>
          </label>
          <input
            id="display-brightness"
            type="range" min="1" max="100" step="1"
            value={status.brightness}
            oninput={(e) => setBrightness(parseInt((e.target as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
          <div class="flex justify-between">
            {#each [25, 50, 75, 100] as p (p)}
              <Button variant="ghost" size="sm" class="text-xs text-muted-foreground px-1.5" onclick={() => setBrightness(p)}>{p}%</Button>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- Night light -->
      <Card class="p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 text-[13px] font-medium" id="night-light-label">
            <div class="w-7 h-7 rounded-md bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
              <Moon size={13} />
            </div>
            Night light
          </div>
          <Toggle checked={status.nightLight} aria-labelledby="night-light-label" onCheckedChange={(v) => setNightLight(v)} />
        </div>

        {#if status.nightLight}
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-muted-foreground">
              <label for="night-light-temp">Temperature</label>
              <span class="tabular-nums">{status.nightLightTemp}K</span>
            </div>
            <input
              id="night-light-temp"
              type="range" min="1700" max="4700" step="100"
              value={status.nightLightTemp}
              oninput={(e) => setNightLightTemp(parseInt((e.target as HTMLInputElement).value))}
              class="w-full accent-primary"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Warm</span>
              <span>Cool</span>
            </div>
          </div>
        {/if}
      </Card>
    {/if}
  </div>
</Page>
