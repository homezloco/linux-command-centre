<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Play, Square, Search, Power, PowerOff } from 'lucide-svelte'

  type Timer = {
    name: string; enabled: string; active: boolean
    activates: string; next: string; last: string
  }

  let timers     = $state<Timer[]>([])
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let working    = $state<string | null>(null)
  let query      = $state('')
  let filter     = $state<'all' | 'active' | 'enabled'>('all')

  async function load(force = false) {
    if (force) refreshing = true; else loading = true
    error = ''
    try { timers = await invoke<Timer[]>('timers:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function act(name: string, action: string) {
    working = `${name}:${action}`; error = ''
    try { await invoke('timers:action', name, action); await load(true) }
    catch (e) { error = String(e) }
    finally { working = null }
  }

  const filtered = $derived(
    timers.filter(t => {
      if (filter === 'active'  && !t.active)               return false
      if (filter === 'enabled' && t.enabled !== 'enabled') return false
      if (query.trim()) {
        const q = query.toLowerCase()
        return t.name.toLowerCase().includes(q) || t.activates.toLowerCase().includes(q)
      }
      return true
    })
  )

  function shortName(name: string): string { return name.replace(/\.timer$/, '') }

  function relTime(iso: string): string {
    if (!iso) return '—'
    const diffMs = new Date(iso).getTime() - Date.now()
    const future = diffMs > 0
    const abs    = Math.abs(diffMs)
    if (abs < 60_000)      return future ? 'in <1 min'   : 'just now'
    const mins = Math.floor(abs / 60_000)
    if (abs < 3_600_000)   return future ? `in ${mins}m`  : `${mins}m ago`
    const hrs = Math.floor(abs / 3_600_000)
    if (abs < 86_400_000)  return future ? `in ${hrs}h`   : `${hrs}h ago`
    const days = Math.floor(abs / 86_400_000)
    return future ? `in ${days}d` : `${days}d ago`
  }

  function isWorking(name: string, action: string): boolean {
    return working === `${name}:${action}`
  }

  const activeCount  = $derived(timers.filter(t => t.active).length)
  const enabledCount = $derived(timers.filter(t => t.enabled === 'enabled').length)

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
          placeholder="Search timers…"
          class="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-secondary/50
                 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div class="flex rounded-md border border-border overflow-hidden text-xs">
        <button
          onclick={() => filter = 'all'}
          class="px-3 py-1.5 transition-colors
                 {filter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'}"
        >all</button>
        <button
          onclick={() => filter = 'active'}
          class="px-3 py-1.5 transition-colors
                 {filter === 'active' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'}"
        >active ({activeCount})</button>
        <button
          onclick={() => filter = 'enabled'}
          class="px-3 py-1.5 transition-colors
                 {filter === 'enabled' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'}"
        >enabled ({enabledCount})</button>
      </div>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        aria-label="Refresh timers"
        class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-50"
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <!-- Timer list -->
    <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {#each filtered as timer}
        <div class="flex items-center gap-3 px-4 py-2.5">
          <!-- Status dot -->
          <div class="w-2 h-2 rounded-full shrink-0
                      {timer.active ? 'bg-green-400' : 'bg-muted-foreground/40'}"></div>

          <!-- Name + activates -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium font-mono">{shortName(timer.name)}</span>
              {#if timer.enabled === 'enabled'}
                <span class="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">enabled</span>
              {:else if timer.enabled === 'disabled'}
                <span class="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground border border-border">disabled</span>
              {:else if timer.enabled === 'static'}
                <span class="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground border border-border">static</span>
              {/if}
            </div>
            {#if timer.activates}
              <p class="text-xs text-muted-foreground truncate">→ {timer.activates}</p>
            {/if}
          </div>

          <!-- Next / last trigger -->
          <div class="text-right shrink-0 w-20 hidden sm:block">
            {#if timer.next}
              <p class="text-xs tabular-nums text-primary">{relTime(timer.next)}</p>
              <p class="text-[10px] text-muted-foreground/50">next</p>
            {:else if timer.last}
              <p class="text-xs tabular-nums text-muted-foreground">{relTime(timer.last)}</p>
              <p class="text-[10px] text-muted-foreground/50">last</p>
            {:else}
              <p class="text-xs text-muted-foreground/40">—</p>
            {/if}
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-1 shrink-0">
            {#if timer.active}
              <button
                onclick={() => act(timer.name, 'stop')}
                disabled={working !== null}
                aria-label="Stop {timer.name}"
                title="Stop"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              >
                {#if isWorking(timer.name, 'stop')}<RefreshCw size={12} class="animate-spin" />
                {:else}<Square size={12} />{/if}
              </button>
            {:else}
              <button
                onclick={() => act(timer.name, 'start')}
                disabled={working !== null || timer.enabled === 'static'}
                aria-label="Start {timer.name}"
                title="Run now"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-green-400 transition-colors disabled:opacity-40"
              >
                {#if isWorking(timer.name, 'start')}<RefreshCw size={12} class="animate-spin" />
                {:else}<Play size={12} />{/if}
              </button>
            {/if}

            {#if timer.enabled === 'enabled'}
              <button
                onclick={() => act(timer.name, 'disable')}
                disabled={working !== null || timer.enabled === 'static'}
                aria-label="Disable {timer.name}"
                title="Disable at boot"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors disabled:opacity-40"
              >
                {#if isWorking(timer.name, 'disable')}<RefreshCw size={12} class="animate-spin" />
                {:else}<PowerOff size={12} />{/if}
              </button>
            {:else if timer.enabled !== 'static'}
              <button
                onclick={() => act(timer.name, 'enable')}
                disabled={working !== null}
                aria-label="Enable {timer.name}"
                title="Enable at boot"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
              >
                {#if isWorking(timer.name, 'enable')}<RefreshCw size={12} class="animate-spin" />
                {:else}<Power size={12} />{/if}
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if filtered.length === 0}
        <div class="px-4 py-8 text-center text-sm text-muted-foreground">
          {query ? 'No timers match your search' : 'No systemd timers found'}
        </div>
      {/if}
    </div>

    <p class="text-xs text-muted-foreground text-right">
      Showing {filtered.length} of {timers.length} timers
    </p>

  </div>
{/if}
