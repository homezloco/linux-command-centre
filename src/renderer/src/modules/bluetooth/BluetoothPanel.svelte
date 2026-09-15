<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, Toggle, ConfirmDialog, EmptyState } from '$ui'
  import { toasts } from '$stores/toasts'
  import { Bluetooth, BluetoothOff, RefreshCw, Headphones, Smartphone, Keyboard, Mouse, Speaker, Search, Trash2 } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Device    = { mac: string; name: string; connected: boolean; type: string }
  type BtStatus  = { blocked: boolean; devices: Device[] }
  type Nearby    = { mac: string; name: string; type: string; rssi: number | null }

  const TITLE = 'Bluetooth'

  let status    = $state<BtStatus | null>(null)
  let loading   = $state(true)
  let refreshing = $state(false)
  let toggling  = $state(false)
  let error     = $state('')

  let nearby    = $state<Nearby[]>([])
  let scanning  = $state(false)
  let scanDone  = $state(false)
  let actingOn  = $state<Set<string>>(new Set())
  let removeTarget = $state<Device | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<BtStatus>('bluetooth:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function toggleRadio() {
    toggling = true
    try {
      await invoke('bluetooth:toggle')
      await load(true)
      toasts.success(status?.blocked ? 'Bluetooth turned off' : 'Bluetooth turned on', TITLE)
    }
    catch (e) { toasts.error(String(e), TITLE) }
    finally { toggling = false }
  }

  async function scan() {
    scanning = true; scanDone = false; nearby = []
    try { nearby = await invoke<Nearby[]>('bluetooth:scan') }
    catch (e) { toasts.error(String(e), TITLE) }
    finally { scanning = false; scanDone = true }
  }

  function setActing(mac: string, active: boolean) {
    const next = new Set(actingOn)
    if (active) next.add(mac)
    else next.delete(mac)
    actingOn = next
  }

  async function deviceOp(
    channel: 'bluetooth:connect' | 'bluetooth:disconnect' | 'bluetooth:pair' | 'bluetooth:remove',
    device: { mac: string; name: string },
    successMsg: string,
  ): Promise<boolean> {
    setActing(device.mac, true)
    try {
      const res = await invoke<{ ok: boolean; error?: string }>(channel, device.mac)
      if (!res.ok) throw new Error(res.error ?? 'Failed')
      toasts.success(successMsg, TITLE)
      await load(true)
      return true
    } catch (e) {
      toasts.error(`${device.name || device.mac}: ${String(e)}`, TITLE)
      return false
    } finally { setActing(device.mac, false) }
  }

  const connect    = (d: Device) => deviceOp('bluetooth:connect', d, `Connected ${d.name}`)
  const disconnect = (d: Device) => deviceOp('bluetooth:disconnect', d, `Disconnected ${d.name}`)

  async function pair(d: Nearby) {
    const label = d.name || `Unknown ${d.type}`
    if (await deviceOp('bluetooth:pair', { mac: d.mac, name: label }, `Paired ${label}`)) {
      nearby = nearby.filter(n => n.mac !== d.mac)
    }
  }

  async function remove(d: Device) {
    if (await deviceOp('bluetooth:remove', d, `Removed ${d.name}`)) removeTarget = null
  }

  onMount(() => { void load() })

  function deviceIcon(type: string) {
    const t = type.toLowerCase()
    if (t.includes('headphone') || t.includes('headset') || t.includes('audio')) return Headphones
    if (t.includes('phone'))    return Smartphone
    if (t.includes('keyboard')) return Keyboard
    if (t.includes('mouse'))    return Mouse
    if (t.includes('speaker'))  return Speaker
    return Bluetooth
  }

  function rssiBars(rssi: number | null): number | null {
    if (rssi == null) return null
    return Math.min(Math.max(Math.round((rssi + 90) / 60 * 4), 0), 4)
  }
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh devices"
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
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-24 w-full" />

    {:else if status}
      <!-- Status + radio toggle -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          {#if status.blocked}
            <BluetoothOff size={22} class="text-muted-foreground" />
          {:else}
            <Bluetooth size={22} class="text-primary" />
          {/if}
          <p class="text-[13px] font-medium" id="bt-radio-label">{status.blocked ? 'Bluetooth is off' : 'Bluetooth is on'}</p>
        </div>
        <Toggle
          checked={!status.blocked}
          disabled={toggling}
          aria-labelledby="bt-radio-label"
          onCheckedChange={() => toggleRadio()}
        />
      </Card>

      {#if !status.blocked}
        <!-- Paired devices -->
        {#if status.devices.length === 0}
          <EmptyState icon={Bluetooth} title="No paired devices" message="Put a device in pairing mode, then scan for it.">
            {#snippet action()}
              <Button variant="primary" size="sm" loading={scanning} onclick={() => scan()}>
                <Search size={12} />
                Scan
              </Button>
            {/snippet}
          </EmptyState>
        {:else}
          <Card padding="none" class="overflow-hidden">
            <div class="px-4 py-2.5 border-b border-border">
              <p class="text-[13px] font-medium">Paired devices</p>
            </div>
            <div class="divide-y divide-border">
              {#each status.devices as device (device.mac)}
                {@const Icon = deviceIcon(device.type)}
                {@const isActing = actingOn.has(device.mac)}
                <div class="flex items-center gap-3 px-4 py-2.5">
                  <Icon size={15} class="shrink-0 {device.connected ? 'text-primary' : 'text-muted-foreground'}" />
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-medium truncate">{device.name}</p>
                    <p class="text-xs text-muted-foreground font-mono">{device.mac}</p>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    {#if device.connected}
                      <Button variant="secondary" size="sm" loading={isActing} onclick={() => disconnect(device)}>
                        Disconnect
                      </Button>
                    {:else}
                      <Button variant="secondary" size="sm" loading={isActing} onclick={() => connect(device)}>
                        Connect
                      </Button>
                    {/if}
                    <Button
                      variant="icon"
                      size="sm"
                      aria-label="Remove {device.name}"
                      class="hover:text-destructive"
                      disabled={isActing}
                      onclick={() => { removeTarget = device }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          </Card>
        {/if}

        <!-- Scan for new devices -->
        <Card padding="none" class="overflow-hidden">
          <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
            <p class="text-[13px] font-medium">Add new device</p>
            <Button variant="primary" size="sm" loading={scanning} onclick={() => scan()}>
              {#if !scanning}<Search size={11} />{/if}
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
          </div>

          {#if scanning}
            <div class="p-4 space-y-3">
              {#each [0, 1, 2] as i (i)}
                <div class="flex items-center gap-3">
                  <Skeleton class="h-4 w-4 shrink-0" />
                  <div class="flex-1 space-y-1.5">
                    <Skeleton class="h-3 w-32" />
                    <Skeleton class="h-2.5 w-24" />
                  </div>
                  <Skeleton class="h-7 w-12" />
                </div>
              {/each}
              <p class="text-xs text-muted-foreground text-center">Make sure your device is in pairing mode</p>
            </div>
          {:else if nearby.length > 0}
            <div class="divide-y divide-border">
              {#each nearby as device (device.mac)}
                {@const Icon = deviceIcon(device.type)}
                {@const isActing = actingOn.has(device.mac)}
                {@const signal = rssiBars(device.rssi)}
                <div class="flex items-center gap-3 px-4 py-2.5">
                  <Icon size={15} class="text-muted-foreground shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] font-medium truncate">{device.name || `Unknown ${device.type}`}</p>
                    <div class="flex items-center gap-2">
                      <p class="text-xs text-muted-foreground font-mono">{device.mac}</p>
                      {#if signal != null}
                        <div class="flex items-end gap-px h-3" aria-hidden="true">
                          {#each [1, 2, 3, 4] as bar (bar)}
                            <div class="w-1 rounded-sm {bar <= signal ? 'bg-primary' : 'bg-muted'}" style="height: {bar * 3}px"></div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <Button variant="primary" size="sm" loading={isActing} onclick={() => pair(device)}>
                    {isActing ? 'Pairing…' : 'Pair'}
                  </Button>
                </div>
              {/each}
            </div>
          {:else if scanDone}
            <div class="py-6 text-center">
              <p class="text-[13px] text-muted-foreground">No new devices found</p>
              <p class="text-xs mt-1 text-muted-foreground">Put your device in pairing mode and scan again</p>
            </div>
          {:else}
            <div class="py-6 text-center text-[13px] text-muted-foreground">
              Press Scan to discover nearby devices
            </div>
          {/if}
        </Card>
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    open={removeTarget !== null}
    onOpenChange={(open) => { if (!open) removeTarget = null }}
    title="Remove {removeTarget?.name ?? 'device'}?"
    description="The device will be unpaired and forgotten. You will need to pair it again to use it."
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { removeTarget = null } },
      { label: 'Remove', variant: 'destructive', onClick: () => remove(removeTarget!) },
    ]}
  />
</Page>
