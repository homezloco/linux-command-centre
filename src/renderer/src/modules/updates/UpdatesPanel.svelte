<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, CheckCircle, AlertCircle, Circle, ExternalLink } from 'lucide-svelte'

  type UpdateItem = {
    label: string
    type: 'github' | 'kernel' | 'package' | 'local'
    state: 'ok' | 'warn' | 'open' | 'closed' | 'error' | 'unknown'
    detail: string
    url?: string
    updatedAt?: string
    comments?: number
  }

  let results    = $state<UpdateItem[]>([])
  let loading    = $state(false)
  let error      = $state('')
  let lastChecked = $state<Date | null>(null)

  async function check() {
    loading = true; error = ''
    try {
      results = await invoke<UpdateItem[]>('updates:check')
      lastChecked = new Date()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  onMount(check)

  function stateIcon(state: UpdateItem['state']) {
    if (state === 'closed' || state === 'ok')
      return { icon: CheckCircle, cls: 'text-green-400' }
    if (state === 'open' || state === 'warn')
      return { icon: AlertCircle, cls: 'text-yellow-400' }
    if (state === 'error')
      return { icon: AlertCircle, cls: 'text-red-400' }
    return { icon: Circle, cls: 'text-muted-foreground' }
  }
</script>

<div class="max-w-lg space-y-3">

  <div class="flex items-center justify-between">
    <p class="text-xs text-muted-foreground">
      {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : 'Not yet checked'}
    </p>
    <button
      onclick={check} disabled={loading}
      class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border
             hover:bg-secondary transition-colors disabled:opacity-50"
    >
      <RefreshCw size={11} class={loading ? 'animate-spin' : ''} />
      {loading ? 'Checking…' : 'Refresh'}
    </button>
  </div>

  {#if loading && results.length === 0}
    <div class="h-40 flex items-center justify-center text-muted-foreground text-sm">
      Fetching upstream issue status…
    </div>
  {:else}
    <div class="rounded-xl border border-border bg-card divide-y divide-border">
      {#each results as item}
        {@const si = stateIcon(item.state)}
        <div class="p-4">
          <div class="flex items-start gap-3">
            <si.icon size={15} class="{si.cls} mt-0.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium leading-snug">{item.label}</p>
              <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words">{item.detail}</p>
              {#if item.updatedAt || item.comments !== undefined}
                <p class="text-xs text-muted-foreground/60 mt-1">
                  {item.updatedAt ? `Updated ${item.updatedAt}` : ''}
                  {item.comments !== undefined ? ` · ${item.comments} comments` : ''}
                </p>
              {/if}
            </div>
            {#if item.url}
              <a href={item.url} target="_blank" rel="noreferrer"
                 class="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
                <ExternalLink size={13} />
              </a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

</div>
