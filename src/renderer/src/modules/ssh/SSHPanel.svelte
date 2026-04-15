<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Key, Plus, Trash2, Copy, CheckCircle2, AlertTriangle, Shield } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  // Matches what ssh:keys handler returns
  type SSHKey = {
    name: string; type: string; fingerprint: string; bits: number
    comment: string; hasPrivate: boolean; publicKey: string
  }
  type AuthKey = { line: number; type: string; comment: string; key: string }
  type SSHStatus = { keys: SSHKey[]; authorizedKeys: AuthKey[]; sshDir: string }

  let status  = $state<SSHStatus | null>(null)
  let loading = $state(true)
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

  // Confirm delete — keyed by key name
  let confirmDelete = $state<string | null>(null)

  const KEY_TYPES = ['ed25519', 'rsa', 'ecdsa']

  async function load() {
    loading = true; error = ''
    try { status = await invoke<SSHStatus>('ssh:keys') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  function isAuthorized(key: SSHKey): boolean {
    if (!status) return false
    return status.authorizedKeys.some(a => a.key.includes(key.publicKey.split(' ')[1] ?? ''))
  }

  async function copyKey(key: SSHKey) {
    try {
      await invoke('clipboard:write', key.publicKey)
      copied = key.name
      setTimeout(() => { if (copied === key.name) copied = null }, 2000)
    } catch (e) { error = String(e) }
  }

  async function deleteKey(name: string) {
    try {
      await invoke('ssh:deleteKey', name)
      confirmDelete = null
      await load()
    } catch (e) { error = String(e) }
  }

  async function generateKey() {
    genError = ''
    if (!genName.trim()) { genError = 'Key name is required'; return }
    if (!/^[a-zA-Z0-9_.-]+$/.test(genName.trim())) { genError = 'Name must be alphanumeric (underscores, dots, dashes OK)'; return }
    genLoading = true
    try {
      await invoke('ssh:generate', genType, genComment || `${genName}@lcc`, genName.trim())
      showGen = false; genName = ''; genComment = ''
      await load()
    } catch (e) { genError = String(e) }
    finally { genLoading = false }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">{status.keys.length} key{status.keys.length !== 1 ? 's' : ''}</h2>
      <div class="flex gap-2">
        <button
          onclick={() => { showGen = !showGen; genError = '' }}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={12} /> Generate Key
        </button>
        <button
          onclick={load}
          class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
          aria-label="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

    <!-- Generate form -->
    {#if showGen}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">New SSH Key</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground" for="gen-name">File name</label>
            <input
              id="gen-name"
              bind:value={genName}
              placeholder="e.g. id_ed25519_work"
              class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground" for="gen-comment">Comment (optional)</label>
            <input
              id="gen-comment"
              bind:value={genComment}
              placeholder="e.g. work laptop"
              class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div class="space-y-1">
          <p class="text-xs text-muted-foreground">Key type</p>
          <div class="flex gap-2">
            {#each KEY_TYPES as t}
              <button
                onclick={() => genType = t}
                class="px-3 py-1 rounded-md text-xs font-medium border transition-colors
                       {genType === t
                         ? 'border-primary/40 bg-primary/10 text-primary'
                         : 'border-border hover:bg-secondary/50 text-muted-foreground'}"
              >
                {t}
              </button>
            {/each}
          </div>
        </div>
        {#if genError}<p class="text-xs text-destructive">{genError}</p>{/if}
        <div class="flex gap-2">
          <button
            onclick={generateKey}
            disabled={genLoading}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                   bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {#if genLoading}<RefreshCw size={12} class="animate-spin" />{:else}<Key size={12} />{/if}
            Generate
          </button>
          <button
            onclick={() => showGen = false}
            class="px-3 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}

    <!-- Key list -->
    {#if status.keys.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-2">
        <Key size={32} class="mx-auto text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No SSH keys found in ~/.ssh/</p>
        <p class="text-xs text-muted-foreground/70">Generate a key or add existing keys to ~/.ssh/</p>
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {#each status.keys as key}
          <div class="p-4 space-y-2">
            <div class="flex items-start gap-3">
              <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                <Key size={14} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">{key.name}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground">
                    {key.type}
                  </span>
                  {#if isAuthorized(key)}
                    <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-1">
                      <Shield size={9} /> authorized
                    </span>
                  {/if}
                  {#if !key.hasPrivate}
                    <span class="text-[10px] text-muted-foreground/50">public only</span>
                  {/if}
                </div>
                {#if key.comment}
                  <p class="text-xs text-muted-foreground mt-0.5">{key.comment}</p>
                {/if}
                <p class="text-[10px] font-mono text-muted-foreground/50 mt-0.5 truncate">{key.fingerprint}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  onclick={() => copyKey(key)}
                  aria-label="Copy public key"
                  title="Copy public key to clipboard"
                  class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors"
                >
                  {#if copied === key.name}
                    <CheckCircle2 size={13} class="text-green-400" />
                  {:else}
                    <Copy size={13} />
                  {/if}
                </button>
                {#if confirmDelete === key.name}
                  <button
                    onclick={() => deleteKey(key.name)}
                    class="px-2 py-1 rounded-md text-xs font-medium bg-destructive text-destructive-foreground"
                  >
                    Confirm
                  </button>
                  <button
                    onclick={() => confirmDelete = null}
                    class="px-2 py-1 rounded-md text-xs bg-secondary hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    onclick={() => confirmDelete = key.name}
                    aria-label="Delete key"
                    class="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Authorized Keys -->
    {#if status.authorizedKeys.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-2">
        <p class="text-sm font-medium flex items-center gap-2">
          <AlertTriangle size={13} class="text-yellow-400" />
          Authorized Keys ({status.authorizedKeys.length})
        </p>
        <p class="text-xs text-muted-foreground">Public keys that can log into this machine:</p>
        <div class="space-y-1 max-h-40 overflow-y-auto">
          {#each status.authorizedKeys as ak}
            <div class="text-[10px] font-mono bg-secondary/50 rounded px-2 py-1 text-muted-foreground">
              <span class="text-muted-foreground/50">{ak.type}</span>
              {#if ak.comment}<span class="ml-2">{ak.comment}</span>{/if}
              <p class="truncate text-muted-foreground/40 mt-0.5">{ak.key}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
{/if}
