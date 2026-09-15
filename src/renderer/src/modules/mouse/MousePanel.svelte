<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle } from '$ui'
  import { RefreshCw, Mouse } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type MouseStatus = {
    speed: number; naturalScroll: boolean; accelProfile: string
    middleEmulation: boolean; leftHanded: boolean
    devices: { id: number; name: string }[]
  }
  type MouseOpts = Partial<Omit<MouseStatus, 'devices'>>

  const TITLE = 'Mouse'

  let status  = $state<MouseStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')

  // Editable copies — every control saves instantly (mouse:set accepts partial opts)
  let speed           = $state(0)
  let naturalScroll   = $state(false)
  let accelProfile    = $state('default')
  let middleEmulation = $state(false)
  let leftHanded      = $state(false)

  const ACCEL_PROFILES = [
    { value: 'default',  label: 'Default',  desc: 'System default acceleration' },
    { value: 'flat',     label: 'Flat',     desc: 'No acceleration — raw input' },
    { value: 'adaptive', label: 'Adaptive', desc: 'Speed-dependent acceleration' },
  ]

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<MouseStatus>('mouse:status')
      speed           = status.speed
      naturalScroll   = status.naturalScroll
      accelProfile    = status.accelProfile
      middleEmulation = status.middleEmulation
      leftHanded      = status.leftHanded
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function apply(opts: MouseOpts) {
    try { await invoke('mouse:set', opts) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert the control to what the desktop actually has
    }
  }

  const pushSpeed = debounce((v: number) => { void apply({ speed: v }) })

  function setAccelProfile(value: string) {
    accelProfile = value
    void apply({ accelProfile: value })
  }

  onMount(() => { void load() })
</script>

{#snippet option(id: string, label: string, desc: string, checked: boolean, onChange: (v: boolean) => void)}
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="text-[13px]" id="{id}-label">{label}</p>
      <p class="text-xs text-muted-foreground">{desc}</p>
    </div>
    <Toggle {checked} aria-labelledby="{id}-label" onCheckedChange={onChange} />
  </div>
{/snippet}

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload mouse settings"
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
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-48 w-full" />
      <Skeleton class="h-40 w-full" />

    {:else if status}
      <!-- Connected mice -->
      {#if status.devices.length > 0}
        <Card class="space-y-2">
          <p class="text-[13px] font-medium flex items-center gap-2">
            <Mouse size={14} class="text-muted-foreground" /> Connected mice
          </p>
          {#each status.devices as dev (dev.id)}
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span class="font-mono bg-secondary px-1.5 py-0.5 rounded text-[11px]">id:{dev.id}</span>
              <span>{dev.name}</span>
            </div>
          {/each}
        </Card>
      {/if}

      <!-- Pointer speed -->
      <Card class="space-y-3">
        <label for="mouse-speed" class="text-[13px] font-medium">Pointer speed</label>
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Slow</span>
            <span class="font-medium text-foreground tabular-nums">{speed >= 0 ? '+' : ''}{speed.toFixed(2)}</span>
            <span>Fast</span>
          </div>
          <input
            id="mouse-speed"
            type="range" min="-1" max="1" step="0.05"
            bind:value={speed}
            oninput={() => pushSpeed(speed)}
            class="w-full accent-primary"
          />
        </div>
      </Card>

      <!-- Acceleration profile -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium" id="mouse-accel-label">Acceleration profile</p>
        <div class="space-y-2" role="radiogroup" aria-labelledby="mouse-accel-label">
          {#each ACCEL_PROFILES as profile (profile.value)}
            <button
              type="button"
              role="radio"
              aria-checked={accelProfile === profile.value}
              onclick={() => setAccelProfile(profile.value)}
              class="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                     {accelProfile === profile.value
                       ? 'border-primary/40 bg-primary/10'
                       : 'border-border hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'}"
            >
              <div class="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                          {accelProfile === profile.value ? 'border-primary' : 'border-muted-foreground'}" aria-hidden="true">
                {#if accelProfile === profile.value}
                  <div class="w-2 h-2 rounded-full bg-primary"></div>
                {/if}
              </div>
              <div>
                <p class="text-[13px] font-medium">{profile.label}</p>
                <p class="text-xs text-muted-foreground">{profile.desc}</p>
              </div>
            </button>
          {/each}
        </div>
      </Card>

      <!-- Options -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium">Options</p>
        {@render option('mouse-natural', 'Natural scrolling', 'Scroll content in the direction of finger movement', naturalScroll,
          (v) => { naturalScroll = v; void apply({ naturalScroll: v }) })}
        <div class="border-t border-border"></div>
        {@render option('mouse-middle', 'Middle-click emulation', 'Simulate middle-click by clicking both buttons', middleEmulation,
          (v) => { middleEmulation = v; void apply({ middleEmulation: v }) })}
        <div class="border-t border-border"></div>
        {@render option('mouse-left', 'Left-handed mode', 'Swap primary and secondary mouse buttons', leftHanded,
          (v) => { leftHanded = v; void apply({ leftHanded: v }) })}
      </Card>
    {/if}
  </div>
</Page>
