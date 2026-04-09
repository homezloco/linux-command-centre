<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Bluetooth, BluetoothOff, RotateCw, Headphones, Smartphone, Keyboard, Mouse, Speaker, Search, Trash2 } from 'lucide-svelte'

  type Device    = { mac: string; name: string; connected: boolean; type: string }
  type BtStatus  = { blocked: boolean; devices: Device[] }
  type Nearby    = { mac: string; name: string }

  let status    = $state<BtStatus | null>(null)
  let loading   = $state(true)
  let toggling  = $state(false)
  let error     = $state('')

  let nearby    = $state<Nearby[]>([])
  let scanning  = $state(false)
  let scanDone  = $state(false)
  let actingOn  = $state<Set<string>>(new Set())
  let deviceError = $state<Record<string, string>>({})
  let confirmingRemove = $state<string | null>(null)

  async function load() {
    loading = true; error = ''
    try { status = await invoke<BtStatus>('bluetooth:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function toggle() {
    toggling = true; error = ''
    try { await invoke('bluetooth:toggle'); await load() }
    catch (e) { error = String(e) }
    finally { toggling = false }
  }

  async function scan() {
    scanning = true; scanDone = false; error = ''; nearby = []
    try { nearby = await invoke<Nearby[]>('bluetooth:scan') }
    catch (e) { error = String(e) }
    finally { scanning = false; scanDone = true }
  }

  function setActing(mac: string, active: boolean) {
    const next = new Set(actingOn)
    if (active) next.add(mac)
    else next.delete(mac)
    actingOn = next
  }

  function setDeviceError(mac: string, msg: string) {
    deviceError = { ...deviceError, [mac]: msg }
    setTimeout(() => {
      deviceError = { ...deviceError, [mac]: '' }
    }, 4000)
  }

  async function connect(mac: string) {
    setActing(mac, true)
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('bluetooth:connect', mac)
      if (!res.ok) throw new Error(res.error ?? 'Failed')
      await load()
    } catch (e) { setDeviceError(mac, String(e)) }
    finally { setActing(mac, false) }
  }

  async function disconnect(mac: string) {
    setActing(mac, true)
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('bluetooth:disconnect', mac)
      if (!res.ok) throw new Error(res.error ?? 'Failed')
      await load()
    } catch (e) { setDeviceError(mac, String(e)) }
    finally { setActing(mac, false) }
  }

  async function pair(mac: string) {
    setActing(mac, true)
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('bluetooth:pair', mac)
      if (!res.ok) throw new Error(res.error ?? 'Pairing failed')
      nearby = nearby.filter(d => d.mac !== mac)
      await load()
    } catch (e) { setDeviceError(mac, String(e)) }
    finally { setActing(mac, false) }
  }

  function confirmRemove(mac: string) {
    confirmingRemove = mac
  }

  function cancelRemove() {
    confirmingRemove = null
  }

  async function remove(mac: string) {
    confirmingRemove = null
    setActing(mac, true)
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('bluetooth:remove', mac)
      if (!res.ok) throw new Error(res.error ?? 'Failed')
      await load()
    } catch (e) { setDeviceError(mac, String(e)) }
    finally { setActing(mac, false) }
  }

  onMount(load)

  function deviceIcon(type: string) {
    const t = type.toLowerCase()
    if (t.includes('headphone') || t.includes('headset') || t.includes('audio')) return Headphones
    if (t.includes('phone'))    return Smartphone
    if (t.includes('keyboard')) return Keyboard
    if (t.includes('mouse'))    return Mouse
    if (t.includes('speaker'))  return Speaker
    return Bluetooth
  }
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}

    <!-- Status + toggle -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          {#if status.blocked}
            <BluetoothOff size={22} class="text-muted-foreground" />
          {:else}
            <Bluetooth size={22} class="text-primary" />
          {/if}
          <p class="font-medium">{status.blocked ? 'Disabled' : 'Enabled'}</p>
        </div>
        <button
          onclick={toggle} disabled={toggling} aria-label="Toggle Bluetooth"
          class={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${status.blocked ? 'bg-secondary' : 'bg-primary'}`}
        >
          <span class={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${status.blocked ? '' : 'translate-x-5'}`}></span>
        </button>
      </div>
      {#if error}<p class="text-xs text-destructive mt-2">{error}</p>{/if}
    </div>

    {#if !status.blocked}

      <!-- Paired devices -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <p class="text-sm font-medium">Paired devices</p>
          <button onclick={load} class="text-muted-foreground hover:text-foreground transition-colors">
            <RotateCw size={13} />
          </button>
        </div>

        {#if status.devices.length === 0}
          <div class="py-6 text-center text-sm text-muted-foreground">No paired devices</div>
        {:else}
          <div class="divide-y divide-border">
            {#each status.devices as device}
              {@const Icon = deviceIcon(device.type)}
              {@const isActing = actingOn.has(device.mac)}
              {@const err = deviceError[device.mac]}
              <div class="flex flex-col">
                <div class="flex items-center gap-3 px-4 py-3">
                  <Icon size={15} class={device.connected ? 'text-primary' : 'text-muted-foreground'} />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{device.name}</p>
                    <p class="text-xs text-muted-foreground font-mono">{device.mac}</p>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    {#if confirmingRemove === device.mac}
                      <span class="text-xs text-destructive mr-1">Remove?</span>
                      <button
                        onclick={() => remove(device.mac)}
                        disabled={isActing}
                        class="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        onclick={cancelRemove}
                        class="text-xs px-2 py-1 rounded border border-border hover:bg-secondary"
                      >
                        No
                      </button>
                    {:else}
                      {#if device.connected}
                        <button
                          onclick={() => disconnect(device.mac)}
                          disabled={isActing}
                          class="text-xs px-2 py-1 rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-50"
                        >
                          {isActing ? '…' : 'Disconnect'}
                        </button>
                      {:else}
                        <button
                          onclick={() => connect(device.mac)}
                          disabled={isActing}
                          class="text-xs px-2 py-1 rounded border border-border hover:bg-secondary transition-colors text-muted-foreground disabled:opacity-50"
                        >
                          {isActing ? '…' : 'Connect'}
                        </button>
                      {/if}
                      <button
                        onclick={() => confirmRemove(device.mac)}
                        disabled={isActing}
                        aria-label="Remove device"
                        class="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    {/if}
                  </div>
                </div>
                {#if err}
                  <div class="px-4 pb-2 -mt-1">
                    <p class="text-xs text-destructive">{err}</p>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Scan for new devices -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <p class="text-sm font-medium">Add new device</p>
          <button
            onclick={scan}
            disabled={scanning}
            class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Search size={11} class={scanning ? 'animate-pulse' : ''} />
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {#if scanning}
          <div class="py-8 text-center text-sm text-muted-foreground">
            <p>Scanning for nearby devices…</p>
            <p class="text-xs mt-1 text-muted-foreground/60">Make sure your device is in pairing mode</p>
          </div>
        {:else if nearby.length > 0}
          <div class="divide-y divide-border">
            {#each nearby as device}
              {@const isActing = actingOn.has(device.mac)}
              {@const err = deviceError[device.mac]}
              <div class="flex flex-col">
                <div class="flex items-center gap-3 px-4 py-3">
                  <Bluetooth size={15} class="text-muted-foreground shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{device.name || 'Unknown device'}</p>
                    <p class="text-xs text-muted-foreground font-mono">{device.mac}</p>
                  </div>
                  <button
                    onclick={() => pair(device.mac)}
                    disabled={isActing}
                    class="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {isActing ? 'Pairing…' : 'Pair'}
                  </button>
                </div>
                {#if err}
                  <div class="px-4 pb-2 -mt-1">
                    <p class="text-xs text-destructive">{err}</p>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else if scanDone}
          <div class="py-6 text-center text-sm text-muted-foreground">
            <p>No new devices found</p>
            <p class="text-xs mt-1 text-muted-foreground/60">Put your device in pairing mode and scan again</p>
          </div>
        {:else}
          <div class="py-6 text-center text-sm text-muted-foreground/60">
            Press Scan to discover nearby devices
          </div>
        {/if}
      </div>

    {/if}
  {/if}
</div>
