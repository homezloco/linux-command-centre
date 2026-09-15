<script lang="ts">
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Button, ConfirmDialog, EmptyState, Listbox } from '$ui'
  import { ShieldCheck, RefreshCw, Plus, Trash2, Lock } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Rule = { num: number; to: string; action: string; from: string; v6: boolean }
  type RuleAction = 'allow' | 'deny' | 'reject'
  type RuleProto = 'tcp' | 'udp' | 'any'

  const TITLE = 'Firewall'
  const ACTION_OPTIONS: { value: RuleAction; label: string }[] = [
    { value: 'allow', label: 'Allow' },
    { value: 'deny', label: 'Deny' },
    { value: 'reject', label: 'Reject' },
  ]
  const PROTO_OPTIONS: { value: RuleProto; label: string }[] = [
    { value: 'tcp', label: 'TCP' },
    { value: 'udp', label: 'UDP' },
    { value: 'any', label: 'Any' },
  ]

  let rules   = $state<Rule[] | null>(null)
  let loading = $state(false)
  let error   = $state('')
  let working = $state(false)

  // Add rule form
  let newAction = $state<RuleAction>('allow')
  let newPort   = $state('')
  let newProto  = $state<RuleProto>('tcp')
  let addError  = $state('')

  let deleteTarget = $state<Rule | null>(null)

  const v4Count = $derived(rules?.filter(r => !r.v6).length ?? 0)
  const v6Count = $derived(rules?.filter(r => r.v6).length ?? 0)

  async function loadRules() {
    loading = true; error = ''
    try { rules = await invoke<Rule[]>('firewall:rules') }
    catch (e) {
      const msg = String(e)
      error = msg
      toasts.error(msg, TITLE)
    }
    finally { loading = false }
  }

  async function addRule() {
    addError = ''
    const port = parseInt(newPort)
    if (!newPort || isNaN(port) || port < 1 || port > 65535) {
      addError = 'Enter a valid port number (1–65535)'; return
    }
    working = true
    try {
      await invoke('firewall:addRule', newAction, newPort, newProto)
      toasts.success(`${newAction.toUpperCase()} rule added for port ${newPort}/${newProto}`, TITLE)
      newPort = ''; addError = ''
      await loadRules()
    } catch (e) {
      const msg = String(e)
      addError = msg
      toasts.error(msg, TITLE)
    }
    finally { working = false }
  }

  async function deleteRule(rule: Rule) {
    working = true
    try {
      await invoke('firewall:deleteRule', rule.num)
      toasts.success(`Firewall rule ${rule.num} deleted`, TITLE)
      deleteTarget = null
      await loadRules()
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { working = false }
  }

  function actionColor(action: string): string {
    if (action === 'ALLOW') return 'text-status-ok bg-status-ok/10 border-status-ok/30'
    if (action === 'DENY' || action === 'REJECT') return 'text-status-fail bg-status-fail/10 border-status-fail/30'
    if (action === 'LIMIT') return 'text-status-warn bg-status-warn/10 border-status-warn/30'
    return 'text-muted-foreground bg-secondary border-border'
  }
</script>

{#snippet refreshAction()}
  <Button
    variant="icon"
    size="sm"
    aria-label="Refresh firewall rules"
    disabled={loading || working}
    onclick={loadRules}
  >
    <RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
  </Button>
{/snippet}

<Page width="wide" actions={rules === null ? undefined : refreshAction}>
  <div class="space-y-4">
    {#if rules === null}
      <!-- Authenticate-to-load: the reference EmptyState -->
      {#if error}<Alert message={error} />{/if}
      <EmptyState icon={Lock} title="UFW Firewall Rules" message="Loading rules requires administrator authentication.">
        {#snippet action()}
          <Button variant="primary" size="sm" loading={loading} onclick={loadRules}>
            {#if !loading}<ShieldCheck size={12} />{/if}
            {loading ? 'Authenticating…' : 'Load Rules'}
          </Button>
        {/snippet}
      </EmptyState>

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">
        {v4Count} {v4Count === 1 ? 'rule' : 'rules'}
        {#if v6Count > 0}
          <span class="text-muted-foreground/70">(+{v6Count} IPv6)</span>
        {/if}
      </h2>

      {#if error}<Alert message={error} />{/if}

      <!-- Add rule -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Plus size={14} class="text-muted-foreground" /> Add Rule
        </p>
        <form
          class="flex gap-2 flex-wrap items-center"
          onsubmit={(e) => { e.preventDefault(); void addRule() }}
        >
          <div class="w-28">
            <Listbox value={newAction} options={ACTION_OPTIONS} aria-label="Rule action" onChange={(v) => { newAction = v }} />
          </div>
          <input
            bind:value={newPort}
            placeholder="Port"
            aria-label="Port"
            type="number" min="1" max="65535"
            class="w-24 h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px]
                   focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div class="w-24">
            <Listbox value={newProto} options={PROTO_OPTIONS} aria-label="Protocol" onChange={(v) => { newProto = v }} />
          </div>
          <Button type="submit" variant="primary" size="sm" loading={working}>Add</Button>
        </form>
        {#if addError}<Alert message={addError} />{/if}
      </Card>

      <!-- Rules table -->
      {#if rules.length === 0}
        <Card class="p-8 text-center">
          <p class="text-[13px] text-muted-foreground">No custom rules — using default policy</p>
        </Card>
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each rules as rule (`${rule.v6 ? '6' : '4'}-${rule.num}`)}
            <div class="flex items-center gap-3 px-4 py-2">
              <span class="text-xs text-muted-foreground font-mono w-6 shrink-0 tabular-nums">{rule.num}</span>
              <span class="font-mono text-[13px] flex-1 truncate">{rule.to}</span>
              <span class="text-[11px] font-medium px-2 py-0.5 rounded border {actionColor(rule.action)}">{rule.action}</span>
              <span class="text-xs text-muted-foreground truncate max-w-[100px]">{rule.from}</span>
              {#if rule.v6}
                <span class="text-[11px] text-muted-foreground">v6</span>
              {/if}
              <Button
                variant="icon"
                size="sm"
                aria-label="Delete rule {rule.num}"
                class="hover:text-destructive"
                disabled={working}
                onclick={() => { deleteTarget = rule }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          {/each}
        </Card>
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    open={deleteTarget !== null}
    onOpenChange={(open) => { if (!open) deleteTarget = null }}
    title="Delete rule {deleteTarget?.num ?? ''}?"
    description="{deleteTarget ? `${deleteTarget.to} ${deleteTarget.action} ${deleteTarget.from}` : ''} will be removed from UFW immediately."
    busy={working}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { deleteTarget = null } },
      { label: 'Delete', variant: 'destructive', onClick: () => deleteRule(deleteTarget!) },
    ]}
  />
</Page>
