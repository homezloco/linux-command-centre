<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, SegmentedControl, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, Key, Plus, Trash2, Copy, CheckCircle2, AlertTriangle, Shield } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  // Matches what ssh:keys handler returns
  type SSHKey = {
    name: string; type: string; fingerprint: string; bits: number
    comment: string; hasPrivate: boolean; publicKey: string
  }
  type AuthKey = { line: number; type: string; comment: string; key: string }
  type SSHStatus = { keys: SSHKey[]; authorizedKeys: AuthKey[]; sshDir: string }

  const TITLE = 'SSH Keys'
  const inputCls = 'w-full h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'
  const KEY_TYPE_OPTIONS = [
    { value: 'ed25519', label: 'ed25519' },
    { value: 'rsa',     label: 'rsa' },
    { value: 'ecdsa',   label: 'ecdsa' },
  ]

  let status  = $state<SSHStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')

  // Generate form
  let showGen     = $state(false)
  let genType     = $state('ed25519')
  let genComment  = $state('')
  let genName     = $state('')
  let genLoading  = $state(false)
  let genError    = $state('')

  // Copy feedback — keyed by key name
  let copied = $state<string | null>(null)

  // Delete confirm
  let deleteTarget = $state<SSHKey | null>(null)
  let deleting = $state(false)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<SSHStatus>('ssh:keys') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function isAuthorized(key: SSHKey): boolean {
    if (!status) return false
    return status.authorizedKeys.some(a => a.key.includes(key.publicKey.split(' ')[1] ?? ''))
  }

  async function copyKey(key: SSHKey) {
    try {
      await invoke('clipboard:write', key.publicKey)
      copied = key.name
      toasts.success('Public key copied to clipboard', TITLE)
      setTimeout(() => { if (copied === key.name) copied = null }, 2000)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
  }

  async function deleteKey(key: SSHKey) {
    deleting = true
    try {
      await invoke('ssh:deleteKey', key.name)
      deleteTarget = null
      toasts.success(`Deleted key ${key.name}`, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally { deleting = false }
  }

  async function generateKey() {
    genError = ''
    if (!genName.trim()) { genError = 'Key name is required'; return }
    if (!/^[a-zA-Z0-9_.-]+$/.test(genName.trim())) { genError = 'Name must be alphanumeric (underscores, dots, dashes OK)'; return }
    genLoading = true
    try {
      await invoke('ssh:generate', genType, genComment || `${genName}@lcc`, genName.trim())
      showGen = false; genName = ''; genComment = ''
      toasts.success(`Generated ${genType} key`, TITLE)
      await load(true)
    } catch (e) {
      const msg = String(e)
      genError = msg
      toasts.error(msg, TITLE)
    }
    finally { genLoading = false }
  }

  onMount(() => load())
</script>

<Page width="wide">
  {#snippet actions()}
    <Button variant="primary" size="sm" disabled={loading} onclick={() => { showGen = !showGen; genError = '' }}>
      <Plus size={13} /> Generate Key
    </Button>
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh keys"
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
      <Skeleton class="h-3 w-20" />
      <Card padding="none">
        {#each [0, 1, 2] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3.5 border-b border-border/60 last:border-0">
            <Skeleton class="h-8 w-8 rounded-lg shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-2.5 w-64" />
            </div>
          </div>
        {/each}
      </Card>

    {:else if status}
      <h2 class="text-[13px] font-medium text-muted-foreground">{status.keys.length} key{status.keys.length !== 1 ? 's' : ''}</h2>

      <!-- Generate form -->
      {#if showGen}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">New SSH Key</p>
          <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); void generateKey() }}>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground" for="gen-name">File name</label>
                <input id="gen-name" bind:value={genName} placeholder="e.g. id_ed25519_work" class={inputCls} />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground" for="gen-comment">Comment (optional)</label>
                <input id="gen-comment" bind:value={genComment} placeholder="e.g. work laptop" class={inputCls} />
              </div>
            </div>
            <div class="space-y-1.5">
              <p class="text-xs text-muted-foreground">Key type</p>
              <SegmentedControl value={genType} options={KEY_TYPE_OPTIONS} ariaLabel="Key type" onChange={(v) => { genType = v }} />
            </div>
            {#if genError}<p class="text-xs text-destructive">{genError}</p>{/if}
            <div class="flex gap-2">
              <Button type="submit" variant="primary" size="sm" loading={genLoading}>
                {#if !genLoading}<Key size={13} />{/if}
                Generate
              </Button>
              <Button variant="secondary" size="sm" onclick={() => { showGen = false; genError = '' }}>Cancel</Button>
            </div>
          </form>
        </Card>
      {/if}

      <!-- Key list -->
      {#if status.keys.length === 0}
        <EmptyState icon={Key} title="No SSH keys" message="No keys were found in ~/.ssh/. Generate a key or add existing ones.">
          {#snippet action()}
            <Button variant="primary" size="sm" onclick={() => { showGen = true }}><Plus size={13} /> Generate Key</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each status.keys as key (key.name)}
            <div class="p-4">
              <div class="flex items-start gap-3">
                <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                  <Key size={14} />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[13px] font-medium">{key.name}</span>
                    <span class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
                      {key.type}
                    </span>
                    {#if isAuthorized(key)}
                      <span class="text-[11px] font-medium px-1.5 py-0.5 rounded bg-status-ok/10 border border-status-ok/30 text-status-ok flex items-center gap-1">
                        <Shield size={10} /> authorized
                      </span>
                    {/if}
                    {#if !key.hasPrivate}
                      <span class="text-[11px] text-muted-foreground/50">public only</span>
                    {/if}
                  </div>
                  {#if key.comment}
                    <p class="text-xs text-muted-foreground mt-0.5">{key.comment}</p>
                  {/if}
                  <p class="text-[11px] font-mono text-muted-foreground/50 mt-0.5 truncate">{key.fingerprint}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Button
                    variant="icon"
                    size="sm"
                    aria-label="Copy public key {key.name}"
                    onclick={() => copyKey(key)}
                  >
                    {#if copied === key.name}
                      <CheckCircle2 size={13} class="text-status-ok" />
                    {:else}
                      <Copy size={13} />
                    {/if}
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    aria-label="Delete key {key.name}"
                    class="hover:text-destructive"
                    onclick={() => { deleteTarget = key }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          {/each}
        </Card>
      {/if}

      <!-- Authorized Keys -->
      {#if status.authorizedKeys.length > 0}
        <Card class="space-y-2">
          <p class="text-[13px] font-medium flex items-center gap-2">
            <AlertTriangle size={13} class="text-status-warn" />
            Authorized Keys ({status.authorizedKeys.length})
          </p>
          <p class="text-xs text-muted-foreground">Public keys that can log into this machine:</p>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            {#each status.authorizedKeys as ak (ak.line)}
              <div class="text-[11px] font-mono bg-secondary/50 rounded px-2 py-1 text-muted-foreground">
                <span class="text-muted-foreground/50">{ak.type}</span>
                {#if ak.comment}<span class="ml-2">{ak.comment}</span>{/if}
                <p class="truncate text-muted-foreground/40 mt-0.5">{ak.key}</p>
              </div>
            {/each}
          </div>
        </Card>
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    open={deleteTarget !== null}
    onOpenChange={(open) => { if (!open) deleteTarget = null }}
    title="Delete key {deleteTarget?.name ?? ''}?"
    description="The private and public key files will be permanently removed from ~/.ssh/."
    busy={deleting}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { deleteTarget = null } },
      { label: 'Delete', variant: 'destructive', onClick: () => deleteKey(deleteTarget!) },
    ]}
  />
</Page>
