<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { RefreshCw, ShieldCheck, ShieldOff, Wifi, Lock, Plus, Trash2, X, Globe, FileKey, Upload, Key, Eye, EyeOff, Copy, Check } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type VpnConn = { name: string; type: string; active: boolean; device: string | null }

  let connections = $state<VpnConn[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let toggling = $state<string | null>(null)
  let deleting = $state<string | null>(null)
  let confirmingDelete = $state<string | null>(null)

  // Create dialog state
  let showCreateDialog = $state(false)
  let createType = $state<'openvpn' | 'wireguard'>('openvpn')
  let createStep = $state(1) // For multi-step WireGuard setup
  let createName = $state('')
  let createGateway = $state('')
  let createUsername = $state('')
  let createPassword = $state('')
  let createCertFile = $state('')
  let creating = $state(false)
  let createError = $state('')

  // WireGuard specific
  let wgPrivateKey = $state('')
  let wgPublicKey = $state('')
  let wgPeerKey = $state('')
  let wgPeerEndpoint = $state('')
  let showPrivateKey = $state(false)
  let keyCopied = $state(false)

  // OpenVPN specific
  let ovpnConfigContent = $state('')
  let ovpnFileName = $state('')

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      connections = await invoke<VpnConn[]>('vpn:list')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function toggle(conn: VpnConn) {
    toggling = conn.name
    error = ''
    try {
      if (conn.active) {
        await invoke('vpn:disconnect', conn.name)
        toasts.success(`Disconnected ${conn.name}`, 'VPN')
      } else {
        await invoke('vpn:connect', conn.name)
        toasts.success(`Connected ${conn.name}`, 'VPN')
      }
      await load(true)
    } catch (e) {
      const msg = String(e)
      error = msg
      toasts.error(msg, 'VPN')
    }
    finally { toggling = null }
  }

  function confirmDelete(name: string) {
    confirmingDelete = name
  }

  function cancelDelete() {
    confirmingDelete = null
  }

  async function doDelete(name: string) {
    confirmingDelete = null
    deleting = name
    error = ''
    try {
      await invoke('vpn:delete', name)
      toasts.success(`Deleted VPN profile ${name}`, 'VPN')
      await load(true)
    } catch (e) {
      const msg = String(e)
      error = msg
      toasts.error(msg, 'VPN')
    }
    finally { deleting = null }
  }

  function openCreateDialog() {
    showCreateDialog = true
    createType = 'openvpn'
    createStep = 1
    createName = ''
    createGateway = ''
    createUsername = ''
    createPassword = ''
    createCertFile = ''
    createError = ''
    // Reset WireGuard
    wgPrivateKey = ''
    wgPublicKey = ''
    wgPeerKey = ''
    wgPeerEndpoint = ''
    showPrivateKey = false
    keyCopied = false
    // Reset OpenVPN
    ovpnConfigContent = ''
    ovpnFileName = ''
  }

  function closeCreateDialog() {
    showCreateDialog = false
  }

  async function generateWireGuardKeys() {
    try {
      const result = await invoke<{ privateKey: string; publicKey: string }>('wg:generateKeys')
      wgPrivateKey = result.privateKey
      wgPublicKey = result.publicKey
      keyCopied = false
    } catch (e) {
      createError = 'Failed to generate WireGuard keys: ' + String(e)
    }
  }

  function copyPublicKey() {
    navigator.clipboard.writeText(wgPublicKey)
    keyCopied = true
    setTimeout(() => keyCopied = false, 2000)
  }

  async function handleOvpnFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    ovpnFileName = file.name
    const reader = new FileReader()
    reader.onload = (e) => {
      ovpnConfigContent = e.target?.result as string
      // Try to extract name from file
      if (!createName) {
        createName = file.name.replace('.ovpn', '').replace(/[_-]/g, ' ')
      }
      // Try to extract remote/gateway from config
      const remoteMatch = ovpnConfigContent.match(/remote\s+(\S+)\s+(\d+)/)
      if (remoteMatch && !createGateway) {
        createGateway = remoteMatch[1]
      }
    }
    reader.readAsText(file)
  }

  async function doCreate() {
    if (!createName.trim()) {
      createError = 'Connection name is required'
      return
    }

    // WireGuard validation
    if (createType === 'wireguard') {
      if (createStep === 1) {
        if (!wgPrivateKey || !wgPublicKey) {
          createError = 'Please generate WireGuard keys first'
          return
        }
        createStep = 2
        return
      }
      if (createStep === 2) {
        if (!wgPeerKey.trim()) {
          createError = 'Peer public key is required'
          return
        }
        if (!createGateway.trim() && !wgPeerEndpoint.trim()) {
          createError = 'Gateway or peer endpoint is required'
          return
        }
      }
    }

    // OpenVPN validation
    if (createType === 'openvpn' && ovpnConfigContent) {
      // Using imported config
    } else if (!createGateway.trim() && !ovpnConfigContent) {
      createError = 'Gateway is required'
      return
    }

    creating = true
    createError = ''
    try {
      if (createType === 'wireguard') {
        await invoke('vpn:createWireGuard', {
          name: createName.trim(),
          privateKey: wgPrivateKey,
          publicKey: wgPublicKey,
          peerPublicKey: wgPeerKey.trim(),
          peerEndpoint: wgPeerEndpoint.trim() || createGateway.trim(),
          address: '' // Could add address field if needed
        })
      } else {
        await invoke('vpn:create', {
          name: createName.trim(),
          type: createType,
          gateway: createGateway.trim(),
          username: createUsername.trim() || undefined,
          password: createPassword || undefined,
          certFile: createCertFile.trim() || undefined,
          ovpnConfig: ovpnConfigContent || undefined
        })
      }
      showCreateDialog = false
      toasts.success(`Created ${createType === 'wireguard' ? 'WireGuard' : 'OpenVPN'} profile ${createName.trim()}`, 'VPN')
      await load(true)
    } catch (e) {
      const msg = String(e)
      createError = msg
      toasts.error(msg, 'VPN')
    } finally {
      creating = false
    }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else}
  <div class="space-y-4 max-w-2xl">

    <div class="flex items-center justify-between">
      <button
        onclick={openCreateDialog}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus size={14} />
        Add VPN
      </button>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        aria-label="Refresh"
        class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if error}<Alert message={error} />{/if}

    {#if connections.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-3">
        <div class="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto">
          <ShieldOff size={24} class="text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium">No VPN connections</p>
          <p class="text-xs text-muted-foreground mt-1">Add a VPN connection to get started</p>
        </div>
        <button
          onclick={openCreateDialog}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add VPN Connection
        </button>
      </div>
    {:else}
      <div class="space-y-2">
        {#each connections as conn}
          <div class="rounded-xl border bg-card p-4 flex items-center gap-3
                      {conn.active ? 'border-green-500/30' : 'border-border'}">

            <!-- Icon -->
            <div class="p-2.5 rounded-lg shrink-0
                        {conn.active ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground'}">
              {#if conn.active}
                <ShieldCheck size={18} />
              {:else}
                <ShieldOff size={18} />
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">{conn.name}</p>
                {#if conn.active}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">
                    Connected
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground">
                {conn.type === 'wireguard' ? 'WireGuard' : 'VPN'}
                {#if conn.device && conn.active}
                  · {conn.device}
                {/if}
              </p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              {#if toggling === conn.name}
                <RefreshCw size={16} class="animate-spin text-muted-foreground shrink-0" />
              {:else}
                <button
                  onclick={() => toggle(conn)}
                  aria-label="{conn.active ? 'Disconnect' : 'Connect'} {conn.name}"
                  class="relative w-11 h-6 rounded-full transition-colors shrink-0
                         {conn.active ? 'bg-green-500' : 'bg-secondary border border-border'}"
                >
                  <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow
                               transition-transform {conn.active ? 'translate-x-5' : ''}"></span>
                </button>
              {/if}

              {#if confirmingDelete === conn.name}
                <div class="flex items-center gap-1.5">
                  <button
                    onclick={() => doDelete(conn.name)}
                    disabled={deleting === conn.name}
                    class="px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                  >
                    {deleting === conn.name ? '...' : 'Delete'}
                  </button>
                  <button
                    onclick={cancelDelete}
                    class="px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <button
                  onclick={() => confirmDelete(conn.name)}
                  disabled={deleting === conn.name}
                  aria-label="Delete {conn.name}"
                  class="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <p class="text-xs text-muted-foreground">
      Connections are managed by NetworkManager.
      Some advanced settings may require <span class="font-medium">nmcli</span> or GUI tools.
    </p>
  </div>
{/if}

<!-- Create VPN Dialog -->
{#if showCreateDialog}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={closeCreateDialog}
    role="presentation"
  >
    <div
      class="rounded-xl border border-border bg-card p-6 max-w-md w-full space-y-4 shadow-lg"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vpn-dialog-title"
      tabindex="-1"
    >
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium">Add VPN Connection</h3>
        <button onclick={closeCreateDialog} class="p-1 rounded-md hover:bg-secondary text-muted-foreground">
          <X size={18} />
        </button>
      </div>

      {#if createError}<Alert message={createError} />{/if}

      <div class="space-y-3">
        <!-- Type selector -->
        <div class="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          <button
            onclick={() => createType = 'openvpn'}
            class="flex-1 px-3 py-2 transition-colors {createType === 'openvpn' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50'}"
          >
            OpenVPN
          </button>
          <button
            onclick={() => createType = 'wireguard'}
            class="flex-1 px-3 py-2 border-l border-border transition-colors {createType === 'wireguard' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50'}"
          >
            WireGuard
          </button>
        </div>

        <!-- Name -->
        <div class="space-y-1">
          <label for="vpn-name" class="text-xs text-muted-foreground">Connection name</label>
          <input
            id="vpn-name"
            bind:value={createName}
            placeholder="My VPN"
            class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
          />
        </div>

        <!-- Gateway -->
        <div class="space-y-1">
          <label for="vpn-gateway" class="text-xs text-muted-foreground flex items-center gap-1">
            <Globe size={12} />
            Gateway (IP or hostname)
          </label>
          <input
            id="vpn-gateway"
            bind:value={createGateway}
            placeholder="vpn.example.com or 192.168.1.1"
            class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
          />
        </div>

        {#if createType === 'openvpn'}
          <!-- Config file import -->
          <div class="space-y-1">
            <label for="vpn-ovpn-file" class="text-xs text-muted-foreground flex items-center gap-1">
              <Upload size={12} />
              Import .ovpn config file (optional)
            </label>
            <div class="flex gap-2">
              <input
                id="vpn-ovpn-file"
                type="file"
                accept=".ovpn"
                onchange={handleOvpnFileSelect}
                class="flex-1 text-xs file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:bg-secondary file:text-foreground hover:file:bg-secondary/80"
              />
            </div>
            {#if ovpnFileName}
              <p class="text-xs text-green-400">✓ Imported: {ovpnFileName}</p>
            {/if}
          </div>

          <div class="text-xs text-muted-foreground text-center">— or enter manually —</div>

          <!-- Username -->
          <div class="space-y-1">
            <label for="vpn-username" class="text-xs text-muted-foreground">Username (optional)</label>
            <input
              id="vpn-username"
              bind:value={createUsername}
              placeholder="Username"
              class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
            />
          </div>

          <!-- Password -->
          <div class="space-y-1">
            <label for="vpn-password" class="text-xs text-muted-foreground">Password (optional)</label>
            <input
              id="vpn-password"
              type="password"
              bind:value={createPassword}
              placeholder="Password"
              class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
            />
          </div>

          <!-- Certificate -->
          <div class="space-y-1">
            <label for="vpn-cert" class="text-xs text-muted-foreground flex items-center gap-1">
              <FileKey size={12} />
              CA Certificate path (optional)
            </label>
            <input
              id="vpn-cert"
              bind:value={createCertFile}
              placeholder="/path/to/ca.crt"
              class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
            />
          </div>
        {/if}

        {#if createType === 'wireguard'}
          <!-- Step indicator -->
          <div class="flex items-center gap-2 text-xs">
            <span class="px-2 py-1 rounded-full {createStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}">1</span>
            <div class="h-px flex-1 bg-border"></div>
            <span class="px-2 py-1 rounded-full {createStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}">2</span>
          </div>

          {#if createStep === 1}
            <!-- Step 1: Generate Keys -->
            <div class="space-y-3">
              <p class="text-sm font-medium">Generate WireGuard Keys</p>
              
              {#if !wgPrivateKey}
                <button
                  onclick={generateWireGuardKeys}
                  class="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Key size={16} />
                  Generate Key Pair
                </button>
              {:else}
                <div class="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                  <!-- Public Key (sharable) -->
                  <div class="space-y-1">
                    <span class="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye size={12} />
                      Your Public Key (share with server admin)
                    </span>
                    <div class="flex gap-2">
                      <code class="flex-1 text-xs font-mono bg-secondary px-2 py-1.5 rounded break-all">{wgPublicKey}</code>
                      <button
                        onclick={copyPublicKey}
                        class="p-1.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
                        title="Copy public key"
                      >
                        {#if keyCopied}
                          <Check size={14} class="text-green-400" />
                        {:else}
                          <Copy size={14} />
                        {/if}
                      </button>
                    </div>
                  </div>

                  <!-- Private Key (hidden) -->
                  <div class="space-y-1">
                    <span class="text-xs text-muted-foreground flex items-center gap-1">
                      {#if showPrivateKey}
                        <Eye size={12} />
                      {:else}
                        <EyeOff size={12} />
                      {/if}
                      Private Key (keep secret)
                    </span>
                    <div class="flex gap-2">
                      <code class="flex-1 text-xs font-mono bg-secondary px-2 py-1.5 rounded break-all">
                        {showPrivateKey ? wgPrivateKey : '•'.repeat(44)}
                      </code>
                      <button
                        onclick={() => showPrivateKey = !showPrivateKey}
                        class="p-1.5 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
                        title={showPrivateKey ? 'Hide' : 'Show'}
                      >
                        {#if showPrivateKey}
                          <EyeOff size={14} />
                        {:else}
                          <Eye size={14} />
                        {/if}
                      </button>
                    </div>
                  </div>
                </div>

                <p class="text-xs text-muted-foreground">
                  <strong>Next:</strong> Give your public key to the server administrator, then click Continue to add the server as a peer.
                </p>

                <button
                  onclick={() => createStep = 2}
                  class="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Continue →
                </button>
              {/if}
            </div>
          {:else}
            <!-- Step 2: Peer Configuration -->
            <div class="space-y-3">
              <p class="text-sm font-medium">Add Server as Peer</p>
              
              <div class="space-y-1">
                <label for="wg-peer-key" class="text-xs text-muted-foreground flex items-center gap-1">
                  <Key size={12} />
                  Server/Peer Public Key
                </label>
                <input
                  id="wg-peer-key"
                  bind:value={wgPeerKey}
                  placeholder="abc123... (get this from your server admin)"
                  class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm font-mono focus:outline-none"
                />
              </div>

              <div class="space-y-1">
                <label for="wg-peer-endpoint" class="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe size={12} />
                  Server Endpoint (IP:port or hostname:port)
                </label>
                <input
                  id="wg-peer-endpoint"
                  bind:value={wgPeerEndpoint}
                  placeholder="vpn.example.com:51820 or 192.168.1.1:51820"
                  class="w-full px-3 py-2 rounded-md border border-border bg-secondary/50 text-sm focus:outline-none"
                />
              </div>

              <button
                onclick={() => createStep = 1}
                class="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to keys
              </button>
            </div>
          {/if}
        {/if}
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          onclick={closeCreateDialog}
          disabled={creating}
          class="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={doCreate}
          disabled={creating || !createName.trim() || (createType === 'openvpn' && !createGateway.trim() && !ovpnConfigContent) || (createType === 'wireguard' && createStep === 2 && !wgPeerKey.trim())}
          class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}
