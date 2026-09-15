<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, Toggle, Dialog, ConfirmDialog, EmptyState } from '$ui'
  import { toasts } from '$stores/toasts'
  import { Wifi, WifiOff, Lock, Unlock, RefreshCw, Check, Trash2, Bookmark, Shield, Search } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type WifiStatus = { blocked: boolean; ssid: string | null; signal: number | null; security: string | null }
  type Network    = { ssid: string; signal: number; security: string; bssid: string; active: boolean }
  type SavedNetwork = { name: string; active: boolean }

  const TITLE = 'Wi-Fi'

  let status    = $state<WifiStatus | null>(null)
  let networks  = $state<Network[]>([])
  let saved     = $state<SavedNetwork[]>([])
  let macRandomization = $state(false)
  let loading   = $state(true)
  let scanning  = $state(false)
  let toggling  = $state(false)
  let togglingMac = $state(false)
  let disconnecting = $state(false)
  let connecting = $state('')       // ssid currently being connected
  let error     = $state('')

  // Password dialog state
  let pwdTarget = $state<Network | null>(null)
  let pwdInput  = $state('')

  // Forget confirm state
  let forgetTarget = $state<string | null>(null)

  function isOpen(net: Network) {
    return net.security === 'Open' || net.security === '--'
  }

  async function loadStatus() {
    error = ''
    try {
      status = await invoke<WifiStatus>('wifi:status')
      const macRandom = await invoke<{ enabled: boolean }>('wifi:macRandomization')
      macRandomization = macRandom.enabled
    }
    catch (e) { error = String(e) }
  }

  async function loadSaved() {
    try { saved = await invoke<SavedNetwork[]>('wifi:saved') }
    catch (e) { console.error('Failed to load saved networks', e) }
  }

  async function scan() {
    scanning = true
    try {
      networks = await invoke<Network[]>('wifi:scan')
      await loadSaved()
    }
    catch (e) { toasts.error(String(e), TITLE) }
    finally { scanning = false }
  }

  async function toggleRadio() {
    toggling = true
    try {
      await invoke('wifi:toggle')
      await loadStatus()
      toasts.success(status?.blocked ? 'Wi-Fi turned off' : 'Wi-Fi turned on', TITLE)
      if (!status?.blocked) await scan()
    }
    catch (e) { toasts.error(String(e), TITLE) }
    finally { toggling = false }
  }

  function connect(net: Network) {
    if (!isOpen(net)) {
      pwdTarget = net; pwdInput = ''
      return
    }
    void doConnect(net.ssid)
  }

  async function doConnect(ssid: string, password?: string) {
    connecting = ssid; pwdTarget = null
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('wifi:connect', ssid, password)
      if (!res.ok) throw new Error(res.error ?? 'Connection failed')
      toasts.success(`Connected to ${ssid}`, TITLE)
      await loadStatus()
      await scan()
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { connecting = '' }
  }

  async function disconnect() {
    disconnecting = true
    const from = status?.ssid
    try {
      await invoke('wifi:disconnect')
      toasts.success(from ? `Disconnected from ${from}` : 'Disconnected', TITLE)
      await loadStatus()
      await scan()
    }
    catch (e) { toasts.error(String(e), TITLE) }
    finally { disconnecting = false }
  }

  async function forget(name: string) {
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('wifi:forget', name)
      if (!res.ok) throw new Error(res.error ?? 'Failed to forget network')
      toasts.success(`Forgot ${name}`, TITLE)
      forgetTarget = null
      await loadSaved()
      await scan()
    } catch (e) { toasts.error(String(e), TITLE) }
  }

  async function setMacRandomization(enabled: boolean) {
    togglingMac = true
    try {
      await invoke('wifi:setMacRandomization', enabled)
      macRandomization = enabled
      toasts.success(`MAC address randomization ${enabled ? 'enabled' : 'disabled'}`, TITLE)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { togglingMac = false }
  }

  onMount(async () => {
    await loadStatus()
    loading = false
    if (status && !status.blocked) await scan()
  })

  // Signal strength → bar count (0-4)
  function bars(signal: number) { return Math.min(4, Math.round(signal / 25)) }

  function barColor(signal: number) {
    if (signal >= 70) return 'text-status-ok'
    if (signal >= 40) return 'text-status-warn'
    return 'text-status-fail'
  }
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Scan for networks"
      disabled={scanning || loading || !!status?.blocked}
      onclick={() => scan()}
    >
      <RefreshCw size={14} class={scanning ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-48 w-full" />
      <Skeleton class="h-16 w-full" />

    {:else if status}
      <!-- Header: status + radio toggle -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          {#if status.blocked}
            <WifiOff size={22} class="text-muted-foreground shrink-0" />
            <p class="text-[13px] font-medium text-muted-foreground" id="wifi-radio-label">Wi-Fi is off</p>
          {:else}
            <Wifi size={22} class="text-primary shrink-0" />
            <div class="min-w-0">
              <p class="text-[13px] font-medium truncate" id="wifi-radio-label">{status.ssid ?? 'Not connected'}</p>
              {#if status.ssid && status.signal !== null}
                <p class="text-xs text-muted-foreground">{status.signal}% signal · {status.security ?? ''}</p>
              {/if}
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {#if status.ssid}
            <Button variant="secondary" size="sm" loading={disconnecting} onclick={disconnect}>
              Disconnect
            </Button>
          {/if}
          <Toggle
            checked={!status.blocked}
            disabled={toggling}
            aria-label="Wi-Fi radio"
            onCheckedChange={() => toggleRadio()}
          />
        </div>
      </Card>

      <!-- Network list -->
      {#if !status.blocked}
        {#if scanning && networks.length === 0}
          <Card padding="none">
            {#each [0, 1, 2, 3] as i (i)}
              <div class="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-0">
                <Skeleton class="h-4 w-4 shrink-0" />
                <Skeleton class="h-3 flex-1" />
                <Skeleton class="h-3 w-3 shrink-0" />
              </div>
            {/each}
          </Card>
        {:else if networks.length === 0}
          <EmptyState icon={Wifi} title="No networks found" message="Move closer to an access point and scan again.">
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
              <p class="text-[13px] font-medium">Available networks</p>
            </div>
            <div class="divide-y divide-border max-h-80 overflow-y-auto">
              {#each networks as net (net.ssid)}
                <button
                  type="button"
                  onclick={() => connect(net)}
                  disabled={connecting !== '' || net.active}
                  aria-label="{net.active ? 'Connected to' : 'Connect to'} {net.ssid}"
                  class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]
                         transition-colors text-left disabled:cursor-default
                         {net.active ? 'bg-primary/5' : ''}"
                >
                  <!-- Signal bars -->
                  <div class="flex items-end gap-[2px] w-4 {barColor(net.signal)} shrink-0" aria-hidden="true">
                    {#each [1, 2, 3, 4] as b (b)}
                      <div class="w-[3px] rounded-sm transition-colors {bars(net.signal) >= b ? 'opacity-100' : 'opacity-20'}"
                           style="height: {b * 4}px; background: currentColor;"></div>
                    {/each}
                  </div>

                  <div class="flex-1 min-w-0">
                    <p class="text-[13px] truncate {net.active ? 'text-primary font-medium' : ''}">{net.ssid}</p>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    {#if isOpen(net)}
                      <Unlock size={11} class="text-muted-foreground/50" />
                    {:else}
                      <Lock size={11} class="text-muted-foreground" />
                    {/if}
                    {#if net.active}
                      <Check size={14} class="text-primary" />
                    {:else if connecting === net.ssid}
                      <span class="text-xs text-muted-foreground">Connecting…</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </Card>
        {/if}
      {/if}

      <!-- Saved networks -->
      {#if saved.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-2.5 border-b border-border">
            <p class="text-[13px] font-medium flex items-center gap-2">
              <Bookmark size={14} class="text-muted-foreground" />
              Saved networks ({saved.length})
            </p>
          </div>
          <div class="divide-y divide-border max-h-40 overflow-y-auto">
            {#each saved as net (net.name)}
              <div class="flex items-center justify-between gap-2 px-4 py-1.5">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[13px] text-muted-foreground truncate">{net.name}</span>
                  {#if net.active}
                    <span class="text-[11px] px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Connected</span>
                  {/if}
                </div>
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="Forget {net.name}"
                  class="hover:text-destructive"
                  onclick={() => { forgetTarget = net.name }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- MAC randomisation -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <Shield size={15} class="text-muted-foreground shrink-0" />
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="wifi-mac-label">MAC address randomization</p>
            <p class="text-xs text-muted-foreground">Use a random MAC address for privacy</p>
          </div>
        </div>
        <Toggle
          checked={macRandomization}
          disabled={togglingMac}
          aria-labelledby="wifi-mac-label"
          onCheckedChange={(v) => setMacRandomization(v)}
        />
      </Card>
    {/if}
  </div>

  <!-- Password dialog -->
  <Dialog
    open={pwdTarget !== null}
    onOpenChange={(open) => { if (!open) pwdTarget = null }}
    title="Connect to {pwdTarget?.ssid ?? ''}"
    description="This network is secured with {pwdTarget?.security ?? 'a password'}."
    class="max-w-sm"
  >
    <form
      class="space-y-3"
      onsubmit={(e) => { e.preventDefault(); if (pwdTarget && pwdInput) void doConnect(pwdTarget.ssid, pwdInput) }}
    >
      <input
        type="password"
        placeholder="Password"
        aria-label="Network password"
        autocomplete="off"
        bind:value={pwdInput}
        class="w-full h-8 px-3 rounded-md bg-secondary/50 border border-border text-[13px] focus:outline-none"
      />
      <div class="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onclick={() => { pwdTarget = null }}>Cancel</Button>
        <Button type="submit" variant="primary" size="sm" disabled={!pwdInput}>Connect</Button>
      </div>
    </form>
  </Dialog>

  <ConfirmDialog
    open={forgetTarget !== null}
    onOpenChange={(open) => { if (!open) forgetTarget = null }}
    title="Forget {forgetTarget ?? ''}?"
    description="The saved password for this network will be removed. You can reconnect by entering it again."
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { forgetTarget = null } },
      { label: 'Forget', variant: 'destructive', onClick: () => forget(forgetTarget!) },
    ]}
  />
</Page>
