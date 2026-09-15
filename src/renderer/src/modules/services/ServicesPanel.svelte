<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { isDangerousUnit } from '$lib/units'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, SegmentedControl, SearchField, ConfirmDialog, EmptyState } from '$ui'
  import { RefreshCw, Play, Square, RotateCcw, Server } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Service = {
    name: string; active: string; sub: string
    description: string; enabledState: string
  }
  type UnitAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'
  type Filter = 'all' | 'active' | 'failed'

  const TITLE = 'Services'

  let services   = $state<Service[]>([])
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let actioning  = $state<Record<string, string>>({})

  let query  = $state('')
  let filter = $state<Filter>('all')
  let pendingUnit = $state<{ svc: Service; action: UnitAction } | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { services = await invoke<Service[]>('services:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  // Dangerous units get a ConfirmDialog before stop / restart / disable; the rest are instant.
  function requestAction(svc: Service, action: UnitAction) {
    if (action !== 'start' && action !== 'enable' && isDangerousUnit(svc.name)) {
      pendingUnit = { svc, action }
      return
    }
    void act(svc, action)
  }

  async function act(svc: Service, action: UnitAction) {
    actioning = { ...actioning, [svc.name]: action }
    try {
      await invoke('services:action', svc.name, action)
      const pastTense = action === 'stop' ? 'stopped' : `${action}ed`
      toasts.success(`${shortUnit(svc.name)} ${pastTense}`, TITLE)
      pendingUnit = null
      await load(true)
    } catch (e) {
      toasts.error(String(e), `Failed to ${action} service`)
    } finally { actioning = { ...actioning, [svc.name]: '' } }
  }

  const filtered = $derived(
    services.filter(s => {
      if (filter === 'active' && s.active !== 'active') return false
      if (filter === 'failed' && s.active !== 'failed') return false
      if (query.trim()) {
        const q = query.toLowerCase()
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      }
      return true
    })
  )

  const failedCount = $derived(services.filter(s => s.active === 'failed').length)
  const FILTER_OPTIONS = $derived([
    { value: 'all' as Filter, label: 'All' },
    { value: 'active' as Filter, label: 'Active' },
    { value: 'failed' as Filter, label: failedCount > 0 ? `Failed (${failedCount})` : 'Failed' },
  ])

  function subColor(sub: string): string {
    if (sub === 'running') return 'text-status-ok'
    if (sub === 'exited') return 'text-muted-foreground'
    if (sub === 'failed') return 'text-status-fail'
    return 'text-status-warn'
  }

  function stateDot(active: string): string {
    if (active === 'failed') return 'bg-status-fail'
    if (active === 'active') return 'bg-status-ok'
    return 'bg-muted-foreground/40'
  }

  function shortUnit(unit: string): string {
    return unit.replace(/\.service$/, '')
  }

  onMount(() => load())
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh services"
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
        placeholder="Search services…"
        aria-label="Search services"
        class="flex-1"
        onChange={(v) => { query = v }}
      />
      <SegmentedControl
        value={filter}
        options={FILTER_OPTIONS}
        ariaLabel="Filter services"
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
          </div>
        {/each}
      </Card>
    {:else if filtered.length === 0}
      <EmptyState
        icon={Server}
        title={query || filter !== 'all' ? 'No services match' : 'No services found'}
        message={query ? 'Nothing matches the current search.' : 'systemd reported no loaded services.'}
      >
        {#snippet action()}
          {#if query || filter !== 'all'}
            <Button variant="secondary" size="sm" onclick={() => { query = ''; filter = 'all' }}>Clear filter</Button>
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <!-- Service list -->
      <Card padding="none" class="divide-y divide-border overflow-hidden">
        {#each filtered as svc (svc.name)}
          {@const busy = actioning[svc.name]}
          {@const canToggleEnable = svc.enabledState === 'enabled' || svc.enabledState === 'disabled'}
          <div class="flex items-center gap-3 px-4 py-2.5 {busy ? 'opacity-60' : ''}">
            <div class="w-2 h-2 rounded-full shrink-0 {stateDot(svc.active)}"></div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[13px] font-medium font-mono" id="svc-{svc.name}-label">{shortUnit(svc.name)}</span>
                {#if !canToggleEnable}
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">{svc.enabledState}</span>
                {/if}
                <span class="text-xs {subColor(svc.sub)}">{svc.active}{svc.sub && svc.sub !== svc.active ? ` (${svc.sub})` : ''}</span>
              </div>
              {#if svc.description}
                <p class="text-xs text-muted-foreground truncate">{svc.description}</p>
              {/if}
            </div>

            <div class="flex items-center gap-1 shrink-0">
              {#if svc.active === 'active'}
                <Button
                  variant="icon" size="sm"
                  aria-label="Restart {svc.name}"
                  class="hover:text-status-warn"
                  disabled={!!busy}
                  onclick={() => requestAction(svc, 'restart')}
                >
                  {#if busy === 'restart'}<RefreshCw size={13} class="animate-spin" />{:else}<RotateCcw size={13} />{/if}
                </Button>
                <Button
                  variant="icon" size="sm"
                  aria-label="Stop {svc.name}"
                  class="hover:text-status-fail"
                  disabled={!!busy}
                  onclick={() => requestAction(svc, 'stop')}
                >
                  {#if busy === 'stop'}<RefreshCw size={13} class="animate-spin" />{:else}<Square size={13} />{/if}
                </Button>
              {:else}
                <Button
                  variant="icon" size="sm"
                  aria-label="Start {svc.name}"
                  class="hover:text-status-ok"
                  disabled={!!busy}
                  onclick={() => requestAction(svc, 'start')}
                >
                  {#if busy === 'start'}<RefreshCw size={13} class="animate-spin" />{:else}<Play size={13} />{/if}
                </Button>
              {/if}
              {#if canToggleEnable}
                <Toggle
                  checked={svc.enabledState === 'enabled'}
                  disabled={!!busy}
                  aria-label="{svc.enabledState === 'enabled' ? 'Disable' : 'Enable'} {svc.name} at boot"
                  onCheckedChange={(v) => requestAction(svc, v ? 'enable' : 'disable')}
                />
              {/if}
            </div>
          </div>
        {/each}
      </Card>

      <p class="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {services.length} services
      </p>
    {/if}
  </div>

  <ConfirmDialog
    open={pendingUnit !== null}
    onOpenChange={(open) => { if (!open) pendingUnit = null }}
    title="{pendingUnit ? pendingUnit.action[0].toUpperCase() + pendingUnit.action.slice(1) : ''} {pendingUnit?.svc.name ?? ''}?"
    description="This unit is critical to the desktop session or network. Interrupting it can drop your session, network, or remote access."
    busy={!!pendingUnit && !!actioning[pendingUnit.svc.name]}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { pendingUnit = null } },
      { label: pendingUnit ? pendingUnit.action[0].toUpperCase() + pendingUnit.action.slice(1) : 'Continue', variant: 'destructive', onClick: () => act(pendingUnit!.svc, pendingUnit!.action) },
    ]}
  />
</Page>
