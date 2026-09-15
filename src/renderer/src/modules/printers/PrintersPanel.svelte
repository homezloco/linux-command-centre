<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, Printer, Star, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type PrinterItem = { name: string; state: string; uri: string; isDefault: boolean }
  type PrinterStatus = { printers: PrinterItem[]; default: string | null }

  const TITLE = 'Printers'

  let status  = $state<PrinterStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')
  let working = $state<string | null>(null)
  let deleteTarget = $state<PrinterItem | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<PrinterStatus>('printers:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function setDefault(name: string) {
    working = name
    try {
      await invoke('printers:setDefault', name)
      toasts.success(`Set ${name} as default printer`, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { working = null }
  }

  async function deletePrinter(p: PrinterItem) {
    working = p.name
    try {
      await invoke('printers:delete', p.name)
      toasts.success(`Deleted printer ${p.name}`, TITLE)
      deleteTarget = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { working = null }
  }

  function stateIcon(state: string) {
    if (state === 'idle') return CheckCircle2
    if (state === 'stopped') return AlertCircle
    return Loader2
  }

  function stateColor(state: string): string {
    if (state === 'idle') return 'text-status-ok'
    if (state === 'stopped') return 'text-status-warn'
    if (state === 'printing') return 'text-primary'
    return 'text-muted-foreground'
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh printers"
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
      <Skeleton class="h-3 w-24" />
      <Card padding="none">
        {#each [0, 1] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton class="h-8 w-8 shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-40" />
              <Skeleton class="h-2.5 w-56" />
            </div>
          </div>
        {/each}
      </Card>

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">
        {status?.printers.length ?? 0} printer{status?.printers.length !== 1 ? 's' : ''}
      </h2>

      {#if !status || status.printers.length === 0}
        <EmptyState
          icon={Printer}
          title="No printers configured"
          message="Add printers via GNOME Settings or the CUPS web interface at localhost:631."
        />
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each status.printers as p (p.name)}
            {@const StateIcon = stateIcon(p.state)}
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="p-2 rounded-lg shrink-0 {p.isDefault ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}">
                <Printer size={16} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium truncate">{p.name}</span>
                  {#if p.isDefault}
                    <span class="text-[11px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">default</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <StateIcon size={11} class="{stateColor(p.state)} shrink-0" />
                  <span class="text-xs text-muted-foreground capitalize">{p.state}</span>
                  {#if p.uri}
                    <span class="text-xs text-muted-foreground truncate">{p.uri}</span>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                {#if !p.isDefault}
                  <Button
                    variant="icon"
                    size="sm"
                    aria-label="Set {p.name} as default"
                    class="hover:text-primary"
                    loading={working === p.name}
                    disabled={working !== null}
                    onclick={() => setDefault(p.name)}
                  >
                    <Star size={14} />
                  </Button>
                {/if}
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="Delete printer {p.name}"
                  class="hover:text-destructive"
                  disabled={working !== null}
                  onclick={() => { deleteTarget = p }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          {/each}
        </Card>
      {/if}
    {/if}
  </div>

  <ConfirmDialog
    open={deleteTarget !== null}
    onOpenChange={(open) => { if (!open) deleteTarget = null }}
    title="Remove printer {deleteTarget?.name ?? ''}?"
    description="The printer will be removed from CUPS. Queued jobs are discarded."
    busy={working !== null}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { deleteTarget = null } },
      { label: 'Remove', variant: 'destructive', onClick: () => deletePrinter(deleteTarget!) },
    ]}
  />
</Page>
