<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Usb, HardDrive, Keyboard, Mouse, Headphones, Smartphone, Layers, MonitorSpeaker } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type UsbDevice = {
    bus: string; device: string; vendorId: string; productId: string
    description: string; hub: boolean
  }

  let devices = $state<UsbDevice[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let showHubs = $state(false)

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      devices = await invoke<UsbDevice[]>('usb:list')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function deviceIcon(desc: string) {
    const d = desc.toLowerCase()
    if (/keyboard/.test(d))                        return Keyboard
    if (/mouse|trackball|pointer/.test(d))         return Mouse
    if (/audio|headset|headphone|speaker|sound/.test(d)) return Headphones
    if (/phone|android|iphone|mobile/.test(d))     return Smartphone
    if (/storage|disk|flash|drive|card reader/.test(d)) return HardDrive
    if (/hub/.test(d))                              return Layers
    if (/webcam|camera/.test(d))                    return MonitorSpeaker
    return Usb
  }

  function iconColor(desc: string): string {
    const d = desc.toLowerCase()
    if (/keyboard|mouse/.test(d))  return 'bg-blue-500/10 text-blue-400'
    if (/audio|headset/.test(d))   return 'bg-purple-500/10 text-purple-400'
    if (/storage|disk/.test(d))    return 'bg-orange-500/10 text-orange-400'
    if (/hub/.test(d))             return 'bg-secondary text-muted-foreground'
    return 'bg-primary/10 text-primary'
  }

  const visible = $derived(showHubs ? devices : devices.filter(d => !d.hub))

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error}
  <Alert message={error} />

{:else}
  <div class="space-y-4 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-medium text-muted-foreground">
          {visible.length} device{visible.length !== 1 ? 's' : ''} connected
        </h2>
        <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" bind:checked={showHubs} class="rounded" />
          Show hubs
        </label>
      </div>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
               bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>

    {#if visible.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No USB devices found
      </div>
    {:else}
      <div class="space-y-2">
        {#each visible as dev}
          {@const Icon = deviceIcon(dev.description)}
          <div class="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div class="p-2 rounded-lg shrink-0 {iconColor(dev.description)}">
              <Icon size={15} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{dev.description}</p>
              <p class="text-xs text-muted-foreground font-mono">
                {dev.vendorId}:{dev.productId}
                <span class="ml-2 text-muted-foreground/60">Bus {dev.bus} · Dev {dev.device}</span>
              </p>
            </div>
            {#if dev.hub}
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">hub</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  </div>
{/if}
