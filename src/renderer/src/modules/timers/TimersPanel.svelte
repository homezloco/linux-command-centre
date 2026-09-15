<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { isDangerousUnit } from '$lib/units'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, SegmentedControl, SearchField, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, Play, Square, Timer } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Timer = {
    name: string; enabled: string; active: boolean
    activates: string; next: string; last: string
  }
  type TimerAction = 'start' | 'stop' | 'enable' | 'disable'
  type Filter = 'all' | 'active' | 'enabled'

  const TITLE = 'Timers'

  let timers     = $state<Timer[]>([])
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let actioning  = $state<Record<string, string>>({})
  let query      = $state('')
  let filter     = $state<Filter>('all')
  let pendingUnit = $state<{ timer: Timer; action: TimerAction } | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { timers = await invoke<Timer[]>('timers:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  // Same rule as Services: dangerous units confirm before stop / disable.
  function requestAction(timer: Timer, action: TimerAction) {
    if (action !== 'start' && action !== 'enable' && isDangerousUnit(timer.name)) {
      pendingUnit = { timer, action }
      return
    }
    void act(timer, action)
  }

  async function act(timer: Timer, action: TimerAction) {
    actioning = { ...actioning, [timer.name]: action }
    try {
      await invoke('timers:action', timer.name, action)
      const pastTense = action === 'stop' ? 'stopped' : `${action}ed`
      toasts.success(`${shortName(timer.name)} ${pastTense}`, TITLE)
      pendingUnit = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), `Failed to ${action} timer`)
    } finally { actioning = { ...actioning, [timer.name]: '' } }
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

  const activeCount  = $derived(timers.filter(t => t.active).length)
  const enabledCount = $derived(timers.filter(t => t.enabled === 'enabled').length)
  const FILTER_OPTIONS = $derived([
    { value: 'all' as Filter, label: 'All' },
    { value: 'active' as Filter, label: `Active (${activeCount})` },
    { value: 'enabled' as Filter, label: `Enabled (${enabledCount})` },
  ])

  onMount(() => load())
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh timers"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
    <!-- Toolbar -->
    <div class="flex items-center gap-2">
      <SearchField
        value={query}
        placeholder="Search timers…"
        aria-label="Search timers"
        class="flex-1"
        onChange={(v) => { query = v }}
      />
      <SegmentedControl
        value={filter}
        options={FILTER_OPTIONS}
        ariaLabel="Filter timers"
        onChange={(v) => { filter = v }}
      />
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Card padding="none">
        {#each [0, 1, 2, 3, 4, 5] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton class="h-2 w-2 rounded-full shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-48" />
              <Skeleton class="h-2.5 w-72 max-w-full" />
            </div>
            <Skeleton class="h-3 w-14" />
          </div>
        {/each}
      </Card>
    {:else if filtered.length === 0}
      <EmptyState
        icon={Timer}
        title={query || filter !== 'all' ? 'No timers match' : 'No systemd timers found'}
        message={query ? 'Nothing matches the current search.' : 'systemd reported no timers.'}
      >
        {#snippet action()}
          {#if query || filter !== 'all'}
            <Button variant="secondary" size="sm" onclick={() => { query = ''; filter = 'all' }}>Clear filter</Button>
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <!-- Timer list -->
      <Card padding="none" class="divide-y divide-border overflow-hidden">
        {#each filtered as timer (timer.name)}
          {@const busy = actioning[timer.name]}
          {@const canToggleEnable = timer.enabled === 'enabled' || timer.enabled === 'disabled'}
          <div class="flex items-center gap-3 px-4 py-2.5 {busy ? 'opacity-60' : ''}">
            <!-- Status dot -->
            <div class="w-2 h-2 rounded-full shrink-0
                        {timer.active ? 'bg-status-ok' : 'bg-muted-foreground/40'}"></div>

            <!-- Name + activates -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[13px] font-medium font-mono" id="timer-{timer.name}-label">{shortName(timer.name)}</span>
                {#if !canToggleEnable}
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">{timer.enabled}</span>
                {/if}
                {#if timer.active}
                  <span class="text-xs text-status-ok">waiting</span>
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
                <p class="text-[11px] text-muted-foreground/50">next</p>
              {:else if timer.last}
                <p class="text-xs tabular-nums text-muted-foreground">{relTime(timer.last)}</p>
                <p class="text-[11px] text-muted-foreground/50">last</p>
              {:else}
                <p class="text-xs text-muted-foreground/40">—</p>
              {/if}
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1 shrink-0">
              {#if timer.active}
                <Button
                  variant="icon" size="sm"
                  aria-label="Stop {timer.name}"
                  class="hover:text-status-fail"
                  disabled={!!busy}
                  onclick={() => requestAction(timer, 'stop')}
                >
                  {#if busy === 'stop'}<RefreshCw size={13} class="animate-spin" />{:else}<Square size={13} />{/if}
                </Button>
              {:else}
                <Button
                  variant="icon" size="sm"
                  aria-label="Start {timer.name}"
                  class="hover:text-status-ok"
                  disabled={!!busy || timer.enabled === 'static'}
                  onclick={() => requestAction(timer, 'start')}
                >
                  {#if busy === 'start'}<RefreshCw size={13} class="animate-spin" />{:else}<Play size={13} />{/if}
                </Button>
              {/if}
              {#if canToggleEnable}
                <Toggle
                  checked={timer.enabled === 'enabled'}
                  disabled={!!busy}
                  aria-label="{timer.enabled === 'enabled' ? 'Disable' : 'Enable'} {timer.name} at boot"
                  onCheckedChange={(v) => requestAction(timer, v ? 'enable' : 'disable')}
                />
              {/if}
            </div>
          </div>
        {/each}
      </Card>

      <p class="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {timers.length} timers
      </p>
    {/if}
  </div>

  <ConfirmDialog
    open={pendingUnit !== null}
    onOpenChange={(open) => { if (!open) pendingUnit = null }}
    title="{pendingUnit ? pendingUnit.action[0].toUpperCase() + pendingUnit.action.slice(1) : ''} {pendingUnit?.timer.name ?? ''}?"
    description="This unit is critical to the desktop session or network. Interrupting it can drop your session, network, or remote access."
    busy={!!pendingUnit && !!actioning[pendingUnit.timer.name]}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { pendingUnit = null } },
      { label: pendingUnit ? pendingUnit.action[0].toUpperCase() + pendingUnit.action.slice(1) : 'Continue', variant: 'destructive', onClick: () => act(pendingUnit!.timer, pendingUnit!.action) },
    ]}
  />
</Page>
