<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Play, Square, RotateCcw, Search } from 'lucide-svelte'

  type Service = {
    unit: string; load: string; active: string; sub: string
    description: string; enabledState: string
  }

  let services   = $state<Service[]>([])
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let working    = $state<string | null>(null)

  let query  = $state('')
  let filter = $state<'all' | 'active' | 'failed'>('all')

  async function load(force = false) {
    if (force) refreshing = true; else loading = true
    error = ''
    try { services = await invoke<Service[]>('services:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function act(unit: string, action: string) {
    working = `${unit}:${action}`; error = ''
    try { await invoke('services:action', unit, action); await load(true) }
    catch (e) { error = String(e) }
    finally { working = null }
  }

  const filtered = $derived(
    services.filter(s => {
      if (filter === 'active' && s.active !== 'active') return false
      if (filter === 'failed' && s.active !== 'failed') return false
      if (query.trim()) {
        const q = query.toLowerCase()
        return s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      }
      return true
    })
  )

  const failedCount = $derived(services.filter(s => s.active === 'failed').length)

  function stateColor(active: string, sub: string): string {
    if (active === 'failed') return 'text-destructive'
    if (active === 'active' && sub === 'running') return 'text-green-400'
    if (active === 'active') return 'text-blue-400'
    return 'text-muted-foreground'
  }

  function stateDot(active: string): string {
    if (active === 'failed') return 'bg-destructive'
    if (active === 'active') return 'bg-green-400'
    return 'bg-muted-foreground/40'
  }

  function shortUnit(unit: string): string {
    return unit.replace(/\.service$/, '')
  }

  function isWorking(unit: string, action: string): boolean {
    return working === `${unit}:${action}`
  }

  onMount(() => load())
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else}
  <div class="space-y-3 max-w-3xl">

    <!-- Toolbar -->
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          bind:value={query}
          placeholder="Search services…"
          class="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-secondary/50
                 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div class="flex rounded-md border border-border overflow-hidden text-xs">
        {#each (['all', 'active', 'failed'] as const) as f}
          <button
            onclick={() => filter = f}
            class="px-3 py-1.5 capitalize transition-colors
                   {filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'}"
          >
            {f}{f === 'failed' && failedCount > 0 ? ` (${failedCount})` : ''}
          </button>
        {/each}
      </div>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        aria-label="Refresh services"
        class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-50"
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <!-- Service list -->
    <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {#each filtered as svc}
        <div class="flex items-center gap-3 px-4 py-2.5">
          <!-- Status dot -->
          <div class="w-2 h-2 rounded-full shrink-0 {stateDot(svc.active)}"></div>

          <!-- Name + desc -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium font-mono">{shortUnit(svc.unit)}</span>
              {#if svc.enabledState === 'enabled'}
                <span class="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">enabled</span>
              {:else if svc.enabledState === 'disabled'}
                <span class="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground border border-border">disabled</span>
              {/if}
            </div>
            {#if svc.description}
              <p class="text-xs text-muted-foreground truncate">{svc.description}</p>
            {/if}
          </div>

          <!-- State label -->
          <span class="text-xs tabular-nums shrink-0 {stateColor(svc.active, svc.sub)}">
            {svc.active}{svc.sub && svc.sub !== svc.active ? ` (${svc.sub})` : ''}
          </span>

          <!-- Action buttons -->
          <div class="flex items-center gap-1 shrink-0">
            {#if svc.active === 'active'}
              <button
                onclick={() => act(svc.unit, 'stop')}
                disabled={working !== null}
                aria-label="Stop {svc.unit}"
                title="Stop"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              >
                {#if isWorking(svc.unit, 'stop')}<RefreshCw size={12} class="animate-spin" />
                {:else}<Square size={12} />{/if}
              </button>
              <button
                onclick={() => act(svc.unit, 'restart')}
                disabled={working !== null}
                aria-label="Restart {svc.unit}"
                title="Restart"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-40"
              >
                {#if isWorking(svc.unit, 'restart')}<RefreshCw size={12} class="animate-spin" />
                {:else}<RotateCcw size={12} />{/if}
              </button>
            {:else}
              <button
                onclick={() => act(svc.unit, 'start')}
                disabled={working !== null}
                aria-label="Start {svc.unit}"
                title="Start"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-green-400 transition-colors disabled:opacity-40"
              >
                {#if isWorking(svc.unit, 'start')}<RefreshCw size={12} class="animate-spin" />
                {:else}<Play size={12} />{/if}
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if filtered.length === 0}
        <div class="px-4 py-8 text-center text-sm text-muted-foreground">
          {query ? 'No services match your search' : 'No services found'}
        </div>
      {/if}
    </div>

    <p class="text-xs text-muted-foreground text-right">
      Showing {filtered.length} of {services.length} services
    </p>

  </div>
{/if}
