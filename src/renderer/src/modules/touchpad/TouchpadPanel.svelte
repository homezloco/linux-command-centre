<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, EmptyState } from '$ui'
  import { Mouse, RefreshCw, Hand, ScrollText, Gauge, Type } from 'lucide-svelte'
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
  type BoolKey = 'tapToClick' | 'naturalScrolling' | 'twoFingerScroll' | 'disableWhileTyping'

  const TITLE = 'Touchpad'
  const OPTIONS: { key: BoolKey; label: string; icon: typeof Hand }[] = [
    { key: 'tapToClick',         label: 'Tap to click',         icon: Hand },
    { key: 'naturalScrolling',   label: 'Natural scrolling',    icon: ScrollText },
    { key: 'twoFingerScroll',    label: 'Two-finger scroll',    icon: ScrollText },
    { key: 'disableWhileTyping', label: 'Disable while typing', icon: Type },
  ]

  let status = $state<TouchpadStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let rebinding = $state(false)
  let error = $state('')

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<TouchpadStatus>('touchpad:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function rebind() {
    rebinding = true
    try {
      await invoke('touchpad:rebind')
      toasts.success('Touchpad driver rebound — test your touchpad.', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { rebinding = false }
  }

  async function setSetting(key: keyof TouchpadStatus, value: boolean | number) {
    if (!status) return
    status = { ...status, [key]: value }
    try { await invoke('touchpad:setSetting', key, value) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert to what the desktop actually has
    }
  }

  const pushSpeed = debounce((v: number) => { void setSetting('speed', v) })
  function onSpeedInput(v: number) {
    if (!status) return
    status = { ...status, speed: v }
    pushSpeed(v)
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh touchpad status"
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
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-64 w-full" />

    {:else if status}
      {#if status.devices.length === 0}
        <EmptyState icon={Mouse} title="No touchpad detected" message="No touchpad device was found by libinput." />
      {:else}
        <!-- Detected devices -->
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-[13px] font-medium flex items-center gap-2">
              <Mouse size={15} class="text-muted-foreground" />
              Detected devices ({status.devices.length})
            </p>
          </div>
          <div class="divide-y divide-border">
            {#each status.devices as device (device.id)}
              <div class="flex items-center justify-between gap-3 px-4 py-2">
                <span class="text-[13px] text-muted-foreground truncate">{device.name}</span>
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary font-mono shrink-0">{device.id}</span>
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- GXTP7863 rebind (only for that device) -->
      {#if status.hasGXTP7863}
        <Card class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[13px] font-medium">Driver rebind</p>
            {#if status.serviceEnabled}
              <span class="text-[11px] px-2 py-0.5 rounded bg-status-ok/15 text-status-ok">Service enabled</span>
            {:else}
              <span class="text-[11px] px-2 py-0.5 rounded bg-status-warn/15 text-status-warn">Service disabled</span>
            {/if}
          </div>
          <p class="text-xs text-muted-foreground">
            Force reinitialise the GXTP7863 touchpad driver if frozen or unresponsive.
          </p>
          <Button variant="primary" size="sm" loading={rebinding} onclick={rebind}>
            {#if !rebinding}<RefreshCw size={13} />{/if}
            {rebinding ? 'Rebinding…' : 'Rebind now'}
          </Button>
        </Card>
      {/if}

      <!-- Settings -->
      {#if status.devices.length > 0}
        <Card class="space-y-4">
          <p class="text-[13px] font-medium">Touchpad settings</p>

          {#each OPTIONS as opt (opt.key)}
            {@const Icon = opt.icon}
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Icon size={14} class="text-muted-foreground" />
                <span class="text-[13px]" id="touchpad-{opt.key}-label">{opt.label}</span>
              </div>
              <Toggle
                checked={status[opt.key]}
                aria-labelledby="touchpad-{opt.key}-label"
                onCheckedChange={(v) => setSetting(opt.key, v)}
              />
            </div>
          {/each}

          <!-- Speed -->
          <div class="space-y-2 pt-2">
            <div class="flex items-center justify-between">
              <label for="touchpad-speed" class="flex items-center gap-2">
                <Gauge size={14} class="text-muted-foreground" />
                <span class="text-[13px]">Pointer speed</span>
              </label>
              <span class="text-xs text-muted-foreground tabular-nums">{status.speed > 0 ? '+' : ''}{status.speed.toFixed(1)}</span>
            </div>
            <input
              id="touchpad-speed"
              type="range" min="-1" max="1" step="0.1"
              value={status.speed}
              oninput={(e) => onSpeedInput(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full accent-primary"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Slow</span>
              <span>Default</span>
              <span>Fast</span>
            </div>
          </div>
        </Card>
      {/if}
    {/if}
  </div>
</Page>
