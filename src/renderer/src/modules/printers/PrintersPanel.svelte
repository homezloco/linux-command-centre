<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Printer, Star, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type PrinterItem = { name: string; state: string; uri: string; isDefault: boolean }
  type PrinterStatus = { printers: PrinterItem[]; default: string | null }

  let status  = $state<PrinterStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let working = $state<string | null>(null)
  let confirmDelete = $state<string | null>(null)

  async function load() {
    loading = true; error = ''
    try { status = await invoke<PrinterStatus>('printers:list') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setDefault(name: string) {
    working = name; error = ''
    try { await invoke('printers:setDefault', name); await load() }
    catch (e) { error = String(e) }
    finally { working = null }
  }

  async function deletePrinter(name: string) {
    working = name; error = ''; confirmDelete = null
    try { await invoke('printers:delete', name); await load() }
    catch (e) { error = String(e) }
    finally { working = null }
  }

  function stateIcon(state: string) {
    if (state === 'idle') return CheckCircle2
    if (state === 'stopped') return AlertCircle
    return Loader2
  }

  function stateColor(state: string): string {
    if (state === 'idle') return 'text-green-400'
    if (state === 'stopped') return 'text-yellow-400'
    if (state === 'printing') return 'text-blue-400'
    return 'text-muted-foreground'
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else}
  <div class="space-y-4 max-w-xl">

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">
        {status?.printers.length ?? 0} printer{status?.printers.length !== 1 ? 's' : ''}
      </h2>
      <button
        onclick={load}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
               bg-secondary hover:bg-secondary/80 transition-colors"
      >
        <RefreshCw size={12} />
        Refresh
      </button>
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

    {#if !status || status.printers.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-2">
        <Printer size={32} class="mx-auto text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No printers configured</p>
        <p class="text-xs text-muted-foreground/60">
          Add printers via GNOME Settings or the
          <span class="text-primary font-medium">CUPS web interface at localhost:631</span>
        </p>
      </div>

    {:else}
      <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {#each status.printers as p}
          {@const StateIcon = stateIcon(p.state)}
          <div class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg {p.isDefault ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}">
                <Printer size={16} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{p.name}</span>
                  {#if p.isDefault}
                    <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">default</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <StateIcon size={11} class={stateColor(p.state)} />
                  <span class="text-xs text-muted-foreground capitalize">{p.state}</span>
                  {#if p.uri}
                    <span class="text-xs text-muted-foreground/50 truncate max-w-[200px]">{p.uri}</span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1 shrink-0">
                {#if !p.isDefault}
                  <button
                    onclick={() => setDefault(p.name)}
                    disabled={working !== null}
                    aria-label="Set {p.name} as default"
                    title="Set as default"
                    class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                  >
                    {#if working === p.name}<RefreshCw size={14} class="animate-spin" />
                    {:else}<Star size={14} />{/if}
                  </button>
                {/if}
                <button
                  onclick={() => confirmDelete = p.name}
                  disabled={working !== null}
                  aria-label="Delete printer {p.name}"
                  title="Delete printer"
                  class="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {#if confirmDelete === p.name}
              <div class="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center justify-between gap-3">
                <p class="text-xs text-destructive">Remove printer <strong>{p.name}</strong>?</p>
                <div class="flex gap-2 shrink-0">
                  <button onclick={() => deletePrinter(p.name)} class="px-3 py-1 rounded text-xs font-medium bg-destructive text-white hover:bg-destructive/90">Remove</button>
                  <button onclick={() => confirmDelete = null} class="px-3 py-1 rounded text-xs bg-secondary hover:bg-secondary/80">Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  </div>
{/if}
