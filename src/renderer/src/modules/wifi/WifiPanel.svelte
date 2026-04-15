<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Wifi, WifiOff, Lock, Unlock, RefreshCw, X, Check, Trash2, Bookmark, Shield } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type WifiStatus = { blocked: boolean; ssid: string | null; signal: number | null; security: string | null }
  type Network    = { ssid: string; signal: number; security: string; bssid: string; active: boolean }
  type SavedNetwork = { name: string; active: boolean }

  let status    = $state<WifiStatus | null>(null)
  let networks  = $state<Network[]>([])
  let saved     = $state<SavedNetwork[]>([])
  let macRandomization = $state(false)
  let loading   = $state(true)
  let scanning  = $state(false)
  let toggling  = $state(false)
  let connecting = $state('')       // ssid currently being connected
  let error     = $state('')

  // Password dialog state
  let pwdTarget = $state<Network | null>(null)
  let pwdInput  = $state('')
  let pwdError  = $state('')

  async function loadStatus() {
    loading = true; error = ''
    try {
      status = await invoke<WifiStatus>('wifi:status')
      const macRandom = await invoke<{ enabled: boolean }>('wifi:macRandomization')
      macRandomization = macRandom.enabled
    }
    catch (e) { error = String(e) }
    finally { loading = false }
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
    catch (e) { error = String(e) }
    finally { scanning = false }
  }

  async function toggle() {
    toggling = true
    try { await invoke('wifi:toggle'); await loadStatus(); await scan() }
    catch (e) { error = String(e) }
    finally { toggling = false }
  }

  async function connect(net: Network) {
    if (net.security !== 'Open' && net.security !== '--') {
      pwdTarget = net; pwdInput = ''; pwdError = ''
      return
    }
    doConnect(net.ssid)
  }

  async function doConnect(ssid: string, password?: string) {
    connecting = ssid; pwdTarget = null; pwdError = ''
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('wifi:connect', ssid, password)
      if (!res.ok) throw new Error(res.error ?? 'Connection failed')
      await loadStatus()
      await scan()
    } catch (e) { error = String(e) }
    finally { connecting = '' }
  }

  async function disconnect() {
    try { await invoke('wifi:disconnect'); await loadStatus(); await scan() }
    catch (e) { error = String(e) }
  }

  async function forget(name: string) {
    if (!confirm(`Forget network "${name}"?`)) return
    try {
      const res = await invoke<{ ok: boolean; error?: string }>('wifi:forget', name)
      if (!res.ok) throw new Error(res.error ?? 'Failed to forget network')
      await loadSaved()
      await scan()
    } catch (e) { error = String(e) }
  }

  async function toggleMacRandomization() {
    try {
      await invoke('wifi:setMacRandomization', !macRandomization)
      macRandomization = !macRandomization
    } catch (e) { error = String(e) }
  }

  onMount(async () => { await loadStatus(); await scan() })

  // Signal strength → bar count (0-4)
  function bars(signal: number) { return Math.min(4, Math.round(signal / 25)) }

  function barColor(signal: number) {
    if (signal >= 70) return 'text-green-400'
    if (signal >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }
</script>

{#if loading}
  <Spinner />
{:else}
<div class="max-w-md space-y-3">

  <!-- Header: status + toggle -->
  {#if status}
  <div class="rounded-xl border border-border bg-card p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        {#if status.blocked}
          <WifiOff size={22} class="text-muted-foreground" />
          <p class="font-medium text-muted-foreground">Disabled</p>
        {:else}
          <Wifi size={22} class="text-primary" />
          <div>
            <p class="font-medium">{status.ssid ?? 'Not connected'}</p>
            {#if status.ssid && status.signal !== null}
              <p class="text-xs text-muted-foreground">{status.signal}% signal · {status.security ?? ''}</p>
            {/if}
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if status.ssid}
          <button onclick={disconnect}
            class="text-xs px-2 py-1 rounded border border-border hover:bg-secondary transition-colors text-muted-foreground">
            Disconnect
          </button>
        {/if}
        <button onclick={toggle} disabled={toggling} aria-label="Toggle WiFi"
          class={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${status.blocked ? 'bg-secondary' : 'bg-primary'}`}>
          <span class={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${status.blocked ? '' : 'translate-x-5'}`}></span>
        </button>
      </div>
    </div>
    {#if error}<div class="mt-2"><Alert message={error} /></div>{/if}
  </div>
  {/if}

  <!-- Network list -->
  {#if !status?.blocked}
  <div class="rounded-xl border border-border bg-card overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
      <p class="text-sm font-medium">Available networks</p>
      <button onclick={scan} disabled={scanning}
        class="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
        <RefreshCw size={13} class={scanning ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if scanning && networks.length === 0}
      <div class="py-8 text-center text-sm text-muted-foreground">Scanning…</div>
    {:else if networks.length === 0}
      <div class="py-8 text-center text-sm text-muted-foreground">No networks found</div>
    {:else}
      <div class="divide-y divide-border max-h-80 overflow-y-auto">
        {#each networks as net}
          <button
            onclick={() => connect(net)}
            disabled={connecting !== '' || net.active}
            class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50
                   transition-colors text-left disabled:cursor-default
                   {net.active ? 'bg-primary/5' : ''}"
          >
            <!-- Signal bars -->
            <div class="flex items-end gap-[2px] w-4 {barColor(net.signal)} shrink-0">
              {#each [1,2,3,4] as b}
                <div class="w-[3px] rounded-sm transition-colors
                             {bars(net.signal) >= b ? 'opacity-100' : 'opacity-20'}"
                     style="height: {b * 4}px; background: currentColor;"></div>
              {/each}
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-sm truncate {net.active ? 'text-primary font-medium' : ''}">{net.ssid}</p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              {#if net.security === 'Open' || net.security === '--'}
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
    {/if}
  </div>
  {/if}

  <!-- Saved Networks -->
  {#if saved.length > 0}
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <p class="text-sm font-medium flex items-center gap-2">
          <Bookmark size={14} class="text-muted-foreground" />
          Saved networks ({saved.length})
        </p>
      </div>
      <div class="divide-y divide-border max-h-40 overflow-y-auto">
        {#each saved as net}
          <div class="flex items-center justify-between px-4 py-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm text-muted-foreground truncate">{net.name}</span>
              {#if net.active}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Connected</span>
              {/if}
            </div>
            <button
              onclick={() => forget(net.name)}
              class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              title="Forget network"
            >
              <Trash2 size={13} />
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- MAC Randomization -->
  <div class="rounded-xl border border-border bg-card p-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Shield size={15} class="text-muted-foreground" />
        <div>
          <p class="text-sm font-medium">MAC address randomization</p>
          <p class="text-xs text-muted-foreground">Use random MAC for privacy</p>
        </div>
      </div>
      <button
        onclick={toggleMacRandomization}
        aria-label="Toggle MAC address randomization"
        class="relative w-11 h-6 rounded-full transition-colors {macRandomization ? 'bg-primary' : 'bg-secondary border border-border'}"
      >
        <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {macRandomization ? 'translate-x-5' : ''}"></span>
      </button>
    </div>
  </div>

  <!-- Password dialog -->
  {#if pwdTarget}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-card border border-border rounded-xl p-5 w-80 space-y-4 shadow-xl">
      <div class="flex items-center justify-between">
        <p class="font-medium">Connect to "{pwdTarget.ssid}"</p>
        <button onclick={() => pwdTarget = null} class="text-muted-foreground hover:text-foreground">
          <X size={15} />
        </button>
      </div>
      <input
        type="password"
        placeholder="Password"
        bind:value={pwdInput}
        onkeydown={(e) => e.key === 'Enter' && doConnect(pwdTarget!.ssid, pwdInput)}
        class="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm
               focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {#if pwdError}<p class="text-xs text-destructive">{pwdError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button onclick={() => pwdTarget = null}
          class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary transition-colors">
          Cancel
        </button>
        <button
          onclick={() => doConnect(pwdTarget!.ssid, pwdInput)}
          disabled={!pwdInput}
          class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground
                 hover:bg-primary/90 disabled:opacity-50 transition-colors">
          Connect
        </button>
      </div>
    </div>
  </div>
  {/if}

</div>
{/if}
