<script lang="ts">
  import { invoke } from '$lib/utils'
  import { ShieldCheck, RefreshCw, Plus, Trash2, Lock, AlertTriangle } from 'lucide-svelte'

  type Rule = { num: number; to: string; action: string; from: string; v6: boolean }

  let rules   = $state<Rule[] | null>(null)
  let loading = $state(false)
  let error   = $state('')
  let working = $state(false)

  // Add rule form
  let newAction = $state('allow')
  let newPort   = $state('')
  let newProto  = $state('tcp')
  let addError  = $state('')

  let confirmDelete = $state<number | null>(null)

  async function loadRules() {
    loading = true; error = ''
    try { rules = await invoke<Rule[]>('firewall:rules') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function addRule() {
    addError = ''
    const port = parseInt(newPort)
    if (!newPort || isNaN(port) || port < 1 || port > 65535) {
      addError = 'Enter a valid port number (1–65535)'; return
    }
    working = true; error = ''
    try {
      await invoke('firewall:addRule', newAction, newPort, newProto)
      newPort = ''; addError = ''
      await loadRules()
    } catch (e) { addError = String(e) }
    finally { working = false }
  }

  async function deleteRule(num: number) {
    working = true; error = ''; confirmDelete = null
    try { await invoke('firewall:deleteRule', num); await loadRules() }
    catch (e) { error = String(e) }
    finally { working = false }
  }

  function actionColor(action: string): string {
    if (action === 'ALLOW') return 'text-green-400 bg-green-400/10 border-green-400/30'
    if (action === 'DENY' || action === 'REJECT') return 'text-red-400 bg-red-400/10 border-red-400/30'
    if (action === 'LIMIT') return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
    return 'text-muted-foreground bg-secondary border-border'
  }
</script>

<div class="space-y-4 max-w-xl">

  <!-- Intro / load button -->
  {#if rules === null}
    <div class="rounded-xl border border-border bg-card p-6 text-center space-y-3">
      <Lock size={32} class="mx-auto text-muted-foreground/40" />
      <div>
        <p class="text-sm font-medium">UFW Firewall Rules</p>
        <p class="text-xs text-muted-foreground mt-1">Loading rules requires administrator authentication.</p>
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
      <button
        onclick={loadRules}
        disabled={loading}
        class="flex items-center gap-1.5 mx-auto px-4 py-1.5 rounded-md text-sm font-medium
               bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {#if loading}<RefreshCw size={12} class="animate-spin" />{:else}<ShieldCheck size={12} />{/if}
        {loading ? 'Authenticating…' : 'Load Rules'}
      </button>
    </div>

  {:else}

    <!-- Rules list header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">
        {rules.filter(r => !r.v6).length} rules
        {#if rules.filter(r => !r.v6).length !== rules.length}
          <span class="text-muted-foreground/50">(+{rules.filter(r => r.v6).length} IPv6)</span>
        {/if}
      </h2>
      <button
        onclick={loadRules}
        disabled={loading}
        aria-label="Refresh firewall rules"
        class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-50"
      >
        <RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <!-- Add rule -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Plus size={14} class="text-muted-foreground" /> Add Rule
      </p>
      <div class="flex gap-2 flex-wrap">
        <select
          bind:value={newAction}
          class="rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
          <option value="reject">Reject</option>
        </select>
        <input
          bind:value={newPort}
          placeholder="Port"
          type="number" min="1" max="65535"
          class="w-24 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          bind:value={newProto}
          class="rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="any">Any</option>
        </select>
        <button
          onclick={addRule}
          disabled={working}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {#if working}<RefreshCw size={12} class="animate-spin" />{/if}
          Add
        </button>
      </div>
      {#if addError}
        <p class="text-xs text-destructive">{addError}</p>
      {/if}
    </div>

    <!-- Rules table -->
    {#if rules.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center">
        <p class="text-sm text-muted-foreground">No custom rules — using default policy</p>
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {#each rules as rule}
          <div class="flex items-center gap-3 px-4 py-2.5">
            <span class="text-xs text-muted-foreground/50 font-mono w-6 shrink-0">{rule.num}</span>
            <span class="font-mono text-sm flex-1 truncate">{rule.to}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded border {actionColor(rule.action)}">{rule.action}</span>
            <span class="text-xs text-muted-foreground truncate max-w-[100px]">{rule.from}</span>
            {#if rule.v6}
              <span class="text-[10px] text-muted-foreground/50">v6</span>
            {/if}
            <button
              onclick={() => confirmDelete = rule.num}
              disabled={working}
              aria-label="Delete rule {rule.num}"
              class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {#if confirmDelete === rule.num}
            <div class="px-4 py-2.5 bg-destructive/5 flex items-center justify-between gap-3">
              <p class="text-xs text-destructive flex items-center gap-1.5">
                <AlertTriangle size={12} /> Delete rule {rule.num}: {rule.to} {rule.action} {rule.from}?
              </p>
              <div class="flex gap-2 shrink-0">
                <button onclick={() => deleteRule(rule.num)} class="px-3 py-1 rounded text-xs font-medium bg-destructive text-white">Delete</button>
                <button onclick={() => confirmDelete = null} class="px-3 py-1 rounded text-xs bg-secondary">Cancel</button>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

  {/if}
</div>
