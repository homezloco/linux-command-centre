<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, Dialog, ConfirmDialog, EmptyState, SegmentedControl } from '$ui'
  import { RefreshCw, ShieldCheck, ShieldOff, Plus, Trash2, Globe, FileKey, Upload, Key, Eye, EyeOff, Copy, Check } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type VpnConn = { name: string; type: string; active: boolean; device: string | null }
  type VpnType = 'openvpn' | 'wireguard'

  const TITLE = 'VPN'
  const TYPE_OPTIONS: { value: VpnType; label: string }[] = [
    { value: 'openvpn', label: 'OpenVPN' },
    { value: 'wireguard', label: 'WireGuard' },
  ]
  const inputCls = 'w-full h-8 px-3 rounded-md border border-border bg-secondary/50 text-[13px] focus:outline-none'

  let connections = $state<VpnConn[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let toggling = $state<string | null>(null)
  let deleteTarget = $state<VpnConn | null>(null)

  // Create dialog state
  let showCreateDialog = $state(false)
  let createType = $state<VpnType>('openvpn')
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

  const createDisabled = $derived(
    creating
    || !createName.trim()
    || (createType === 'openvpn' && !createGateway.trim() && !ovpnConfigContent)
    || (createType === 'wireguard' && createStep === 2 && !wgPeerKey.trim()),
  )

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
    try {
      if (conn.active) {
        await invoke('vpn:disconnect', conn.name)
        toasts.success(`Disconnected ${conn.name}`, TITLE)
      } else {
        await invoke('vpn:connect', conn.name)
        toasts.success(`Connected ${conn.name}`, TITLE)
      }
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { toggling = null }
  }

  async function doDelete(conn: VpnConn) {
    try {
      await invoke('vpn:delete', conn.name)
      toasts.success(`Deleted VPN profile ${conn.name}`, TITLE)
      deleteTarget = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
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
    if (creating) return
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
    if (createType === 'openvpn' && !ovpnConfigContent && !createGateway.trim()) {
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
      toasts.success(`Created ${createType === 'wireguard' ? 'WireGuard' : 'OpenVPN'} profile ${createName.trim()}`, TITLE)
      await load(true)
    } catch (e) {
      const msg = String(e)
      createError = msg
      toasts.error(msg, TITLE)
    } finally {
      creating = false
    }
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button variant="primary" size="sm" disabled={loading} onclick={openCreateDialog}>
      <Plus size={14} />
      Add VPN
    </Button>
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh VPN connections"
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
      <Skeleton class="h-[4.5rem] w-full" />
      <Skeleton class="h-[4.5rem] w-full" />

    {:else if connections.length === 0}
      <EmptyState icon={ShieldOff} title="No VPN connections" message="Add a VPN connection to get started.">
        {#snippet action()}
          <Button variant="primary" size="sm" onclick={openCreateDialog}>
            <Plus size={14} />
            Add VPN Connection
          </Button>
        {/snippet}
      </EmptyState>

    {:else}
      <div class="space-y-2">
        {#each connections as conn (conn.name)}
          <Card class="flex items-center gap-3 {conn.active ? 'border-status-ok/30' : ''}">
            <!-- Icon -->
            <div class="p-2.5 rounded-lg shrink-0 {conn.active ? 'bg-status-ok/10 text-status-ok' : 'bg-secondary text-muted-foreground'}">
              {#if conn.active}
                <ShieldCheck size={18} />
              {:else}
                <ShieldOff size={18} />
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-[13px] font-medium truncate">{conn.name}</p>
                {#if conn.active}
                  <span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-status-ok/15 text-status-ok shrink-0">
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
            <div class="flex items-center gap-2 shrink-0">
              <Toggle
                checked={conn.active}
                disabled={toggling === conn.name}
                aria-label="{conn.active ? 'Disconnect' : 'Connect'} {conn.name}"
                onCheckedChange={() => toggle(conn)}
              />
              <Button
                variant="icon"
                size="sm"
                aria-label="Delete {conn.name}"
                class="hover:text-destructive"
                disabled={toggling === conn.name}
                onclick={() => { deleteTarget = conn }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </Card>
        {/each}
      </div>
    {/if}

    {#if !loading}
      <p class="text-xs text-muted-foreground">
        Connections are managed by NetworkManager.
        Some advanced settings may require <span class="font-medium">nmcli</span> or GUI tools.
      </p>
    {/if}
  </div>

  <ConfirmDialog
    open={deleteTarget !== null}
    onOpenChange={(open) => { if (!open) deleteTarget = null }}
    title="Delete {deleteTarget?.name ?? 'profile'}?"
    description="The VPN profile and its saved credentials will be removed from NetworkManager."
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { deleteTarget = null } },
      { label: 'Delete', variant: 'destructive', onClick: () => doDelete(deleteTarget!) },
    ]}
  />

  <!-- Create VPN dialog -->
  <Dialog
    open={showCreateDialog}
    onOpenChange={(open) => { if (!open) closeCreateDialog() }}
    title="Add VPN Connection"
    dismissible={!creating}
    class="max-w-md"
  >
    <div class="max-h-[70vh] overflow-y-auto -mx-1 px-1 space-y-3">
      {#if createError}<Alert message={createError} />{/if}

      <SegmentedControl
        value={createType}
        options={TYPE_OPTIONS}
        ariaLabel="VPN type"
        onChange={(v) => { createType = v; createError = '' }}
      />

      <!-- Name -->
      <div class="space-y-1">
        <label for="vpn-name" class="text-xs text-muted-foreground">Connection name</label>
        <input id="vpn-name" bind:value={createName} placeholder="My VPN" class={inputCls} />
      </div>

      <!-- Gateway -->
      <div class="space-y-1">
        <label for="vpn-gateway" class="text-xs text-muted-foreground flex items-center gap-1">
          <Globe size={12} />
          Gateway (IP or hostname)
        </label>
        <input id="vpn-gateway" bind:value={createGateway} placeholder="vpn.example.com or 192.168.1.1" class={inputCls} />
      </div>

      {#if createType === 'openvpn'}
        <!-- Config file import -->
        <div class="space-y-1">
          <label for="vpn-ovpn-file" class="text-xs text-muted-foreground flex items-center gap-1">
            <Upload size={12} />
            Import .ovpn config file (optional)
          </label>
          <input
            id="vpn-ovpn-file"
            type="file"
            accept=".ovpn"
            onchange={handleOvpnFileSelect}
            class="w-full text-xs file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:bg-secondary file:text-foreground hover:file:bg-secondary/80"
          />
          {#if ovpnFileName}
            <p class="text-xs text-status-ok flex items-center gap-1"><Check size={11} /> Imported: {ovpnFileName}</p>
          {/if}
        </div>

        <div class="text-xs text-muted-foreground text-center">— or enter manually —</div>

        <div class="space-y-1">
          <label for="vpn-username" class="text-xs text-muted-foreground">Username (optional)</label>
          <input id="vpn-username" bind:value={createUsername} placeholder="Username" class={inputCls} />
        </div>

        <div class="space-y-1">
          <label for="vpn-password" class="text-xs text-muted-foreground">Password (optional)</label>
          <input id="vpn-password" type="password" bind:value={createPassword} placeholder="Password" class={inputCls} />
        </div>

        <div class="space-y-1">
          <label for="vpn-cert" class="text-xs text-muted-foreground flex items-center gap-1">
            <FileKey size={12} />
            CA Certificate path (optional)
          </label>
          <input id="vpn-cert" bind:value={createCertFile} placeholder="/path/to/ca.crt" class={inputCls} />
        </div>
      {/if}

      {#if createType === 'wireguard'}
        <!-- Step indicator -->
        <div class="flex items-center gap-2 text-xs" aria-label="Step {createStep} of 2">
          <span class="px-2 py-1 rounded-full {createStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}">1</span>
          <div class="h-px flex-1 bg-border"></div>
          <span class="px-2 py-1 rounded-full {createStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}">2</span>
        </div>

        {#if createStep === 1}
          <!-- Step 1: Generate Keys -->
          <div class="space-y-3">
            <p class="text-[13px] font-medium">Generate WireGuard Keys</p>

            {#if !wgPrivateKey}
              <Button variant="primary" size="sm" onclick={generateWireGuardKeys}>
                <Key size={14} />
                Generate Key Pair
              </Button>
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
                    <Button variant="secondary" size="sm" aria-label="Copy public key" onclick={copyPublicKey}>
                      {#if keyCopied}
                        <Check size={14} class="text-status-ok" />
                      {:else}
                        <Copy size={14} />
                      {/if}
                    </Button>
                  </div>
                </div>

                <!-- Private Key (hidden) -->
                <div class="space-y-1">
                  <span class="text-xs text-muted-foreground flex items-center gap-1">
                    {#if showPrivateKey}<Eye size={12} />{:else}<EyeOff size={12} />{/if}
                    Private Key (keep secret)
                  </span>
                  <div class="flex gap-2">
                    <code class="flex-1 text-xs font-mono bg-secondary px-2 py-1.5 rounded break-all">
                      {showPrivateKey ? wgPrivateKey : '•'.repeat(44)}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={showPrivateKey ? 'Hide private key' : 'Show private key'}
                      onclick={() => showPrivateKey = !showPrivateKey}
                    >
                      {#if showPrivateKey}<EyeOff size={14} />{:else}<Eye size={14} />{/if}
                    </Button>
                  </div>
                </div>
              </div>

              <p class="text-xs text-muted-foreground">
                <strong>Next:</strong> Give your public key to the server administrator, then click Continue to add the server as a peer.
              </p>

              <Button variant="primary" size="sm" class="w-full" onclick={() => createStep = 2}>
                Continue →
              </Button>
            {/if}
          </div>
        {:else}
          <!-- Step 2: Peer Configuration -->
          <div class="space-y-3">
            <p class="text-[13px] font-medium">Add Server as Peer</p>

            <div class="space-y-1">
              <label for="wg-peer-key" class="text-xs text-muted-foreground flex items-center gap-1">
                <Key size={12} />
                Server/Peer Public Key
              </label>
              <input id="wg-peer-key" bind:value={wgPeerKey} placeholder="abc123... (get this from your server admin)" class="{inputCls} font-mono" />
            </div>

            <div class="space-y-1">
              <label for="wg-peer-endpoint" class="text-xs text-muted-foreground flex items-center gap-1">
                <Globe size={12} />
                Server Endpoint (IP:port or hostname:port)
              </label>
              <input id="wg-peer-endpoint" bind:value={wgPeerEndpoint} placeholder="vpn.example.com:51820 or 192.168.1.1:51820" class={inputCls} />
            </div>

            <Button variant="ghost" size="sm" class="-ml-2.5 text-muted-foreground" onclick={() => createStep = 1}>
              ← Back to keys
            </Button>
          </div>
        {/if}
      {/if}
    </div>

    <div class="flex items-center justify-end gap-2 pt-2">
      <Button variant="secondary" size="sm" disabled={creating} onclick={closeCreateDialog}>Cancel</Button>
      <Button variant="primary" size="sm" loading={creating} disabled={createDisabled} onclick={doCreate}>
        {createType === 'wireguard' && createStep === 1 ? 'Continue' : 'Create'}
      </Button>
    </div>
  </Dialog>
</Page>
