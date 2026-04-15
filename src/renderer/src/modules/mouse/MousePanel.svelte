<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Mouse } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type MouseStatus = {
    speed: number; naturalScroll: boolean; accelProfile: string
    middleEmulation: boolean; leftHanded: boolean
    devices: { id: number; name: string }[]
  }

  let status  = $state<MouseStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)
  let dirty   = $state(false)

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

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<MouseStatus>('mouse:status')
      speed           = status.speed
      naturalScroll   = status.naturalScroll
      accelProfile    = status.accelProfile
      middleEmulation = status.middleEmulation
      leftHanded      = status.leftHanded
      dirty           = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('mouse:set', { speed, naturalScroll, accelProfile, middleEmulation, leftHanded })
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  const mark = () => { dirty = true }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Connected mice -->
    {#if status.devices.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-2">
        <p class="text-sm font-medium flex items-center gap-2">
          <Mouse size={14} class="text-muted-foreground" /> Connected mice
        </p>
        {#each status.devices as dev}
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span class="font-mono bg-secondary px-1.5 py-0.5 rounded">id:{dev.id}</span>
            <span>{dev.name}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Pointer speed -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Pointer Speed</p>
      <div class="space-y-1">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Slow</span>
          <span class="font-medium text-foreground tabular-nums">{speed >= 0 ? '+' : ''}{speed.toFixed(2)}</span>
          <span>Fast</span>
        </div>
        <input
          type="range" min="-1" max="1" step="0.05"
          bind:value={speed}
          oninput={mark}
          class="w-full accent-primary"
        />
      </div>
    </div>

    <!-- Acceleration profile -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Acceleration Profile</p>
      <div class="space-y-2">
        {#each ACCEL_PROFILES as profile}
          <button
            onclick={() => { accelProfile = profile.value; mark() }}
            class="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                   {accelProfile === profile.value
                     ? 'border-primary/40 bg-primary/10'
                     : 'border-border hover:bg-secondary/50'}"
          >
            <div class="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                        {accelProfile === profile.value ? 'border-primary' : 'border-muted-foreground'}">
              {#if accelProfile === profile.value}
                <div class="w-2 h-2 rounded-full bg-primary"></div>
              {/if}
            </div>
            <div>
              <p class="text-sm font-medium">{profile.label}</p>
              <p class="text-xs text-muted-foreground">{profile.desc}</p>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Toggles -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Options</p>

      {#snippet toggle(label: string, desc: string, value: boolean, setter: () => void)}
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm">{label}</p>
            <p class="text-xs text-muted-foreground">{desc}</p>
          </div>
          <button
            onclick={() => { setter(); mark() }}
            aria-label="Toggle {label}"
            class="relative w-11 h-6 rounded-full transition-colors shrink-0
                   {value ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                         {value ? 'translate-x-5' : ''}"></span>
          </button>
        </div>
      {/snippet}

      {@render toggle(
        'Natural scrolling',
        'Scroll content in the direction of finger movement',
        naturalScroll,
        () => { naturalScroll = !naturalScroll }
      )}
      <div class="border-t border-border"></div>
      {@render toggle(
        'Middle-click emulation',
        'Simulate middle-click by clicking both buttons',
        middleEmulation,
        () => { middleEmulation = !middleEmulation }
      )}
      <div class="border-t border-border"></div>
      {@render toggle(
        'Left-handed mode',
        'Swap primary and secondary mouse buttons',
        leftHanded,
        () => { leftHanded = !leftHanded }
      )}
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

    {#if dirty}
      <div class="flex gap-2">
        <button
          onclick={save}
          disabled={saving}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {#if saving}<RefreshCw size={12} class="animate-spin" />{/if}
          Apply
        </button>
        <button
          onclick={load}
          disabled={saving}
          class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    {/if}

  </div>
{/if}
