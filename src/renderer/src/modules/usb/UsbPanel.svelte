<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, EmptyState } from '$ui'
  import { RefreshCw, Usb, HardDrive, Keyboard, Mouse, Headphones, Smartphone, Layers, MonitorSpeaker } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

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

  // USB class colours are decorative, not status — kept as-is per the spec
  function iconColor(desc: string): string {
    const d = desc.toLowerCase()
    if (/keyboard|mouse/.test(d))  return 'bg-blue-500/10 text-blue-400'
    if (/audio|headset/.test(d))   return 'bg-purple-500/10 text-purple-400'
    if (/storage|disk/.test(d))    return 'bg-orange-500/10 text-orange-400'
    if (/hub/.test(d))             return 'bg-secondary text-muted-foreground'
    return 'bg-primary/10 text-primary'
  }

  const shown = $derived(showHubs ? devices : devices.filter(d => !d.hub))

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
      <input type="checkbox" bind:checked={showHubs} class="rounded border-border bg-secondary" />
      Show hubs
    </label>
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh USB devices"
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
      <Skeleton class="h-3 w-32" />
      {#each [0, 1, 2, 3] as i (i)}
        <Skeleton class="h-16 w-full" />
      {/each}

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">
        {shown.length} device{shown.length !== 1 ? 's' : ''} connected
      </h2>

      {#if shown.length === 0}
        <EmptyState icon={Usb} title="No USB devices found" message={devices.length > 0 ? 'Only hubs are connected — enable “Show hubs” to list them.' : 'Plug in a device and refresh.'} />
      {:else}
        <div class="space-y-2">
          {#each shown as dev (`${dev.bus}:${dev.device}`)}
            {@const Icon = deviceIcon(dev.description)}
            <Card padding="sm" class="flex items-center gap-3">
              <div class="p-2 rounded-lg shrink-0 {iconColor(dev.description)}">
                <Icon size={15} />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium truncate">{dev.description}</p>
                <p class="text-xs text-muted-foreground font-mono">
                  {dev.vendorId}:{dev.productId}
                  <span class="ml-2">Bus {dev.bus} · Dev {dev.device}</span>
                </p>
              </div>
              {#if dev.hub}
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">hub</span>
              {/if}
            </Card>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</Page>
