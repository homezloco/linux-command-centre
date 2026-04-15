<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Mouse, CheckCircle, XCircle, RefreshCw, Hand, ScrollText, Gauge, Type } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert from '$lib/Alert.svelte'

  type TouchpadDevice = { name: string; id: string }

  type TouchpadStatus = {
    devices: TouchpadDevice[]
    hasGXTP7863: boolean
    serviceEnabled: boolean
    tapToClick: boolean
    naturalScrolling: boolean
    speed: number
    twoFingerScroll: boolean
    disableWhileTyping: boolean
  }

  let status = $state<TouchpadStatus | null>(null)
  let loading = $state(true)
  let rebinding = $state(false)
  let rebindMsg = $state('')
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { status = await invoke<TouchpadStatus>('touchpad:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function rebind() {
    rebinding = true; rebindMsg = ''; error = ''
    try {
      await invoke('touchpad:rebind')
      rebindMsg = 'Rebound successfully — test your touchpad.'
      await load()
    } catch (e) { error = String(e) }
    finally { rebinding = false }
    setTimeout(() => rebindMsg = '', 5000)
  }

  async function setSetting(key: string, value: unknown) {
    try {
      await invoke('touchpad:setSetting', key, value)
      await load()
    } catch (e) { error = String(e) }
  }

  onMount(load)
</script>

{#if loading}
  <Spinner height="h-48" />
{:else if status}
  <div class="max-w-md space-y-3">

    <!-- Detected Devices -->
    {#if status.devices.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <p class="text-sm font-medium flex items-center gap-2">
            <Mouse size={15} class="text-muted-foreground" />
            Detected Devices ({status.devices.length})
          </p>
        </div>
        <div class="divide-y divide-border">
          {#each status.devices as device}
            <div class="flex items-center justify-between px-4 py-2.5">
              <span class="text-sm text-muted-foreground truncate">{device.name}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-mono">{device.id}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- GXTP7863 Rebind (only for that device) -->
    {#if status.hasGXTP7863}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Driver Rebind</p>
          {#if status.serviceEnabled}
            <span class="text-[10px] px-2 py-0.5 rounded bg-green-400/20 text-green-400">Service enabled</span>
          {:else}
            <span class="text-[10px] px-2 py-0.5 rounded bg-yellow-400/20 text-yellow-400">Service disabled</span>
          {/if}
        </div>
        <p class="text-xs text-muted-foreground">
          Force reinitialise the GXTP7863 touchpad driver if frozen or unresponsive.
        </p>
        <button
          onclick={rebind}
          disabled={rebinding}
          class="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground
                 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} class={rebinding ? 'animate-spin' : ''} />
          {rebinding ? 'Rebinding…' : 'Rebind now'}
        </button>
        {#if rebindMsg}<p class="text-xs text-green-400">{rebindMsg}</p>{/if}
      </div>
    {/if}

    <!-- Settings -->
    {#if status.devices.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-4">
        <p class="text-sm font-medium">Touchpad Settings</p>

        <!-- Tap to Click -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Hand size={14} class="text-muted-foreground" />
            <span class="text-sm">Tap to click</span>
          </div>
          <button
            onclick={() => setSetting('tapToClick', !status!.tapToClick)}
            aria-label="Toggle tap to click"
            class="relative w-11 h-6 rounded-full transition-colors {status!.tapToClick ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {status!.tapToClick ? 'translate-x-5' : ''}"></span>
          </button>
        </div>

        <!-- Natural Scrolling -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <ScrollText size={14} class="text-muted-foreground" />
            <span class="text-sm">Natural scrolling</span>
          </div>
          <button
            onclick={() => setSetting('naturalScrolling', !status!.naturalScrolling)}
            aria-label="Toggle natural scrolling"
            class="relative w-11 h-6 rounded-full transition-colors {status!.naturalScrolling ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {status!.naturalScrolling ? 'translate-x-5' : ''}"></span>
          </button>
        </div>

        <!-- Two Finger Scroll -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <ScrollText size={14} class="text-muted-foreground" />
            <span class="text-sm">Two-finger scroll</span>
          </div>
          <button
            onclick={() => setSetting('twoFingerScroll', !status!.twoFingerScroll)}
            aria-label="Toggle two-finger scroll"
            class="relative w-11 h-6 rounded-full transition-colors {status!.twoFingerScroll ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {status!.twoFingerScroll ? 'translate-x-5' : ''}"></span>
          </button>
        </div>

        <!-- Disable While Typing -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Type size={14} class="text-muted-foreground" />
            <span class="text-sm">Disable while typing</span>
          </div>
          <button
            onclick={() => setSetting('disableWhileTyping', !status!.disableWhileTyping)}
            aria-label="Toggle disable while typing"
            class="relative w-11 h-6 rounded-full transition-colors {status!.disableWhileTyping ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {status!.disableWhileTyping ? 'translate-x-5' : ''}"></span>
          </button>
        </div>

        <!-- Speed Slider -->
        <div class="space-y-2 pt-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Gauge size={14} class="text-muted-foreground" />
              <span class="text-sm">Pointer speed</span>
            </div>
            <span class="text-xs text-muted-foreground">{status!.speed > 0 ? '+' : ''}{status!.speed.toFixed(1)}</span>
          </div>
          <input
            type="range" min="-1" max="1" step="0.1"
            value={status.speed}
            oninput={(e) => setSetting('speed', parseFloat((e.target as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Slow</span>
            <span>Default</span>
            <span>Fast</span>
          </div>
        </div>
      </div>
    {/if}

    {#if error}<Alert message={error} />{/if}
  </div>
{/if}
