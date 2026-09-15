<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { isDangerousUnit } from '$lib/units'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, Listbox, SegmentedControl, SearchField, ConfirmDialog, EmptyState } from '$ui'
  import { Play, Square, RotateCcw, Plus, Trash2, Power, RefreshCw, Rocket, Server } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  // ── Types ──────────────────────────────────────────────────────────────────
  type StartupApp = {
    id: string; name: string; comment: string; exec: string
    enabled: boolean; system: boolean; path: string
  }

  type GrubStatus = {
    timeout: string; default: string; cmdlineDefault: string
    timeoutStyle: string; entries: string[]
  }

  type Service = {
    name: string; active: string; sub: string; description: string; enabledState: string
  }
  type Tab = 'apps' | 'boot' | 'services'
  type UnitAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

  const TITLE = 'Startup'
  const TABS: { value: Tab; label: string }[] = [
    { value: 'apps', label: 'Apps' },
    { value: 'boot', label: 'Boot' },
    { value: 'services', label: 'Services' },
  ]
  const inputCls = 'w-full h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'

  let tab = $state<Tab>('apps')

  // ── Startup apps ──────────────────────────────────────────────────────────
  let apps = $state<StartupApp[]>([])
  let appsLoading = $state(true)
  let appsRefreshing = $state(false)
  let appsError = $state('')
  let busyApp = $state<Record<string, boolean>>({})
  let showAddForm = $state(false)
  let addName = $state('')
  let addExec = $state('')
  let addComment = $state('')
  let addSaving = $state(false)

  // Command Centre's own autostart entry
  let appAutostart = $state<{ enabled: boolean } | null>(null)
  let appAutostartToggling = $state(false)

  async function loadAppAutostart() {
    try { appAutostart = await invoke<{ enabled: boolean }>('app:autostartStatus') }
    catch (e) { appsError = String(e) }
  }

  async function setAppAutostart(enabled: boolean) {
    appAutostartToggling = true
    try {
      await invoke('app:autostartSet', enabled)
      toasts.success(enabled ? 'Command Centre will start on login' : 'Command Centre will not start on login', TITLE)
      await loadAppAutostart()
    } catch (e) { toasts.error(String(e), TITLE); await loadAppAutostart() }
    finally { appAutostartToggling = false }
  }

  async function loadApps(force = false) {
    if (force) appsRefreshing = true
    appsError = ''
    try { apps = await invoke<StartupApp[]>('startup:list') }
    catch (e) { appsError = String(e) }
    finally { appsLoading = false; appsRefreshing = false }
  }

  function setBusy(id: string, on: boolean) { busyApp = { ...busyApp, [id]: on } }

  async function setAppEnabled(app: StartupApp, enabled: boolean) {
    setBusy(app.id, true)
    try {
      await invoke('startup:toggle', app.id, enabled)
      toasts.success(`${app.name} ${enabled ? 'enabled' : 'disabled'} at login`, TITLE)
      await loadApps(true)
    } catch (e) { toasts.error(String(e), TITLE); await loadApps(true) }
    finally { setBusy(app.id, false) }
  }

  async function removeApp(app: StartupApp) {
    setBusy(app.id, true)
    try {
      await invoke('startup:remove', app.id)
      toasts.success(`Removed ${app.name} from startup`, TITLE)
      await loadApps(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { setBusy(app.id, false) }
  }

  async function addApp() {
    if (!addName.trim() || !addExec.trim()) return
    addSaving = true
    try {
      await invoke('startup:add', addName.trim(), addExec.trim(), addComment.trim())
      toasts.success(`Added ${addName.trim()} to startup`, TITLE)
      addName = ''; addExec = ''; addComment = ''
      showAddForm = false
      await loadApps(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { addSaving = false }
  }

  // ── Boot (GRUB) — same unprivileged grub:status read as the Boot Manager panel ──
  let grub = $state<GrubStatus | null>(null)
  let grubLoading = $state(true)
  let grubError = $state('')
  let grubSaving = $state(false)
  let grubTimeout = $state(10)
  let grubDefault = $state('0')
  const grubChanged = $derived(
    grub !== null && (String(grubTimeout) !== grub.timeout || grubDefault !== grub.default)
  )
  const grubDefaultOptions = $derived.by(() => {
    const opts = (grub?.entries ?? []).map((entry, i) => ({ value: String(i), label: entry }))
    opts.push({ value: 'saved', label: 'Last booted (saved)' })
    const g = grub
    if (g && !opts.some(o => o.value === g.default)) opts.unshift({ value: g.default, label: g.default })
    return opts
  })

  async function loadGrub() {
    grubLoading = true; grubError = ''
    try {
      grub = await invoke<GrubStatus>('grub:status')
      grubTimeout = parseInt(grub.timeout) || 0
      grubDefault = grub.default
    } catch (e) { grubError = String(e) }
    finally { grubLoading = false }
  }

  // Explicit Apply: writes /etc/default/grub and runs update-grub (privileged)
  async function applyGrub() {
    grubSaving = true
    try {
      await invoke('grub:set', { GRUB_TIMEOUT: String(grubTimeout), GRUB_DEFAULT: grubDefault })
      toasts.success('GRUB config updated — changes take effect on next boot', TITLE)
      await loadGrub()
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { grubSaving = false }
  }

  function resetGrub() {
    if (!grub) return
    grubTimeout = parseInt(grub.timeout) || 0
    grubDefault = grub.default
  }

  // ── Services ──────────────────────────────────────────────────────────────
  let services = $state<Service[]>([])
  let servicesLoading = $state(true)
  let servicesRefreshing = $state(false)
  let servicesError = $state('')
  let serviceSearch = $state('')
  let actioning = $state<Record<string, string>>({})
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let pendingUnit = $state<{ svc: Service; action: UnitAction } | null>(null)

  async function loadServices(q?: string, force = false) {
    if (force || services.length) servicesRefreshing = true
    servicesError = ''
    try { services = await invoke<Service[]>('services:list', q || undefined) }
    catch (e) { servicesError = String(e) }
    finally { servicesLoading = false; servicesRefreshing = false }
  }

  function onSearch(v: string) {
    serviceSearch = v
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { void loadServices(serviceSearch) }, 300)
  }

  // Dangerous units get a ConfirmDialog before stop / restart / disable; the rest are instant.
  function requestAction(svc: Service, action: UnitAction) {
    if (action !== 'start' && action !== 'enable' && isDangerousUnit(svc.name)) {
      pendingUnit = { svc, action }
      return
    }
    void runAction(svc, action)
  }

  async function runAction(svc: Service, action: UnitAction) {
    actioning = { ...actioning, [svc.name]: action }
    try {
      await invoke('services:action', svc.name, action)
      toasts.success(`${svc.name}: ${action}`, TITLE)
      pendingUnit = null
      await loadServices(serviceSearch || undefined, true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { actioning = { ...actioning, [svc.name]: '' } }
  }

  // ── Tabs load lazily ───────────────────────────────────────────────────────
  let bootLoaded = false
  let servicesLoaded = false

  $effect(() => {
    if (tab === 'boot' && !bootLoaded) { bootLoaded = true; void loadGrub() }
    if (tab === 'services' && !servicesLoaded) { servicesLoaded = true; void loadServices() }
  })

  onMount(() => { void loadApps(); void loadAppAutostart() })

  function refreshCurrent() {
    if (tab === 'apps') { void loadApps(true); void loadAppAutostart() }
    else if (tab === 'boot') void loadGrub()
    else void loadServices(serviceSearch || undefined, true)
  }
  const refreshing = $derived(tab === 'apps' ? appsRefreshing : tab === 'boot' ? grubLoading : servicesRefreshing)

  // ── Helpers ───────────────────────────────────────────────────────────────
  function subColor(sub: string) {
    if (sub === 'running') return 'text-status-ok'
    if (sub === 'exited') return 'text-muted-foreground'
    if (sub === 'failed') return 'text-status-fail'
    return 'text-status-warn'
  }
  function dotColor(sub: string) {
    if (sub === 'running') return 'bg-status-ok'
    if (sub === 'failed') return 'bg-status-fail'
    return 'bg-muted-foreground/40'
  }
</script>

<Page width="wide">
  {#snippet actions()}
    {#if tab === 'apps'}
      <Button variant="primary" size="sm" onclick={() => { showAddForm = !showAddForm }}>
        <Plus size={13} /> Add
      </Button>
    {/if}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh"
      disabled={refreshing}
      onclick={refreshCurrent}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    <SegmentedControl value={tab} options={TABS} ariaLabel="Startup section" onChange={(v) => { tab = v }} />

    <!-- ══ Apps ═══════════════════════════════════════════════════════════════ -->
    {#if tab === 'apps'}
      {#if appsError}<Alert message={appsError} />{/if}

      <!-- Self autostart -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Power size={16} />
          </div>
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="self-autostart-label">Start on login</p>
            <p class="text-xs text-muted-foreground">Launch Command Centre when you log in</p>
          </div>
        </div>
        {#if !appAutostart}
          <Skeleton class="h-6 w-11 rounded-full" />
        {:else}
          <Toggle checked={appAutostart.enabled} disabled={appAutostartToggling} aria-labelledby="self-autostart-label" onCheckedChange={(v) => setAppAutostart(v)} />
        {/if}
      </Card>

      {#if showAddForm}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">New startup entry</p>
          <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); void addApp() }}>
            <div class="space-y-2">
              <input bind:value={addName} placeholder="Name" aria-label="Name" class={inputCls} />
              <input bind:value={addExec} placeholder="Command (e.g. /usr/bin/nextcloud)" aria-label="Command" class="{inputCls} font-mono" />
              <input bind:value={addComment} placeholder="Description (optional)" aria-label="Description" class={inputCls} />
            </div>
            <div class="flex gap-2">
              <Button type="submit" variant="primary" size="sm" loading={addSaving} disabled={!addName.trim() || !addExec.trim()}>Add</Button>
              <Button variant="secondary" size="sm" onclick={() => { showAddForm = false }}>Cancel</Button>
            </div>
          </form>
        </Card>
      {/if}

      <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">Apps that launch at login</p>

      {#if appsLoading}
        <Card padding="none">
          {#each [0, 1, 2] as i (i)}
            <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-3 w-40" />
                <Skeleton class="h-2.5 w-64" />
              </div>
              <Skeleton class="h-6 w-11 rounded-full" />
            </div>
          {/each}
        </Card>
      {:else if apps.length === 0}
        <EmptyState icon={Rocket} title="No startup apps" message="Nothing is configured to launch at login.">
          {#snippet action()}
            <Button variant="primary" size="sm" onclick={() => { showAddForm = true }}><Plus size={13} /> Add</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each apps as app (app.id)}
            <div class="flex items-center gap-3 px-4 py-2.5 {busyApp[app.id] ? 'opacity-60' : ''}">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[13px] font-medium truncate" id="app-{app.id}-label">{app.name}</span>
                  {#if app.system}
                    <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">system</span>
                  {/if}
                </div>
                {#if app.comment}
                  <p class="text-xs text-muted-foreground truncate">{app.comment}</p>
                {:else if app.exec}
                  <p class="text-xs text-muted-foreground truncate font-mono">{app.exec}</p>
                {/if}
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <Toggle checked={app.enabled} disabled={!!busyApp[app.id]} aria-labelledby="app-{app.id}-label" onCheckedChange={(v) => setAppEnabled(app, v)} />
                {#if !app.system}
                  <Button variant="icon" size="sm" aria-label="Remove {app.name}" class="hover:text-destructive" disabled={!!busyApp[app.id]} onclick={() => removeApp(app)}>
                    <Trash2 size={13} />
                  </Button>
                {/if}
              </div>
            </div>
          {/each}
        </Card>
      {/if}

    <!-- ══ Boot ═══════════════════════════════════════════════════════════════ -->
    {:else if tab === 'boot'}
      <div class="max-w-lg space-y-4">
        {#if grubLoading}
          <Skeleton class="h-28 w-full" />
          <Skeleton class="h-28 w-full" />
        {:else if !grub}
          <EmptyState icon={Server} title="Could not read boot config" message={grubError || '/etc/default/grub could not be read.'}>
            {#snippet action()}
              <Button variant="primary" size="sm" onclick={loadGrub}>Retry</Button>
            {/snippet}
          </EmptyState>
        {:else}
          <Card class="space-y-3">
            <label for="startup-grub-timeout" class="text-[13px] font-medium">Boot timeout</label>
            <p class="text-xs text-muted-foreground">Seconds GRUB waits before booting the default entry.</p>
            <div class="flex items-center gap-3">
              <input id="startup-grub-timeout" type="range" min="0" max="30" step="1" bind:value={grubTimeout} class="flex-1 accent-primary" />
              <span class="text-[13px] font-mono w-10 text-right tabular-nums">{grubTimeout}s</span>
            </div>
            {#if grubTimeout === 0}
              <p class="text-xs text-status-warn">0 seconds hides the menu entirely.</p>
            {/if}
          </Card>

          <Card class="space-y-3">
            <label for="startup-grub-default" class="text-[13px] font-medium">Default OS</label>
            <p class="text-xs text-muted-foreground">Boot entry selected automatically after the timeout.</p>
            {#if grub.entries.length > 0}
              <Listbox id="startup-grub-default" value={grubDefault} options={grubDefaultOptions} onChange={(v) => { grubDefault = v }} />
            {:else}
              <input id="startup-grub-default" bind:value={grubDefault} placeholder="0" class={inputCls} />
              <p class="text-xs text-muted-foreground">Could not read boot entries. Enter an index or entry name manually.</p>
            {/if}
          </Card>

          <Card class="space-y-1">
            <p class="text-[13px] font-medium">Kernel parameters</p>
            <p class="text-xs font-mono text-muted-foreground break-all">{grub.cmdlineDefault || '(none)'}</p>
          </Card>

          <div class="flex items-center gap-2">
            <Button variant="primary" size="sm" loading={grubSaving} disabled={!grubChanged} onclick={applyGrub}>
              {grubSaving ? 'Applying…' : 'Apply & update-grub'}
            </Button>
            {#if grubChanged}
              <Button variant="secondary" size="sm" disabled={grubSaving} onclick={resetGrub}>Reset</Button>
            {/if}
          </div>
        {/if}
      </div>

    <!-- ══ Services ═══════════════════════════════════════════════════════════ -->
    {:else}
      <SearchField value={serviceSearch} placeholder="Search services…" aria-label="Search services" onChange={onSearch} />

      {#if servicesError}<Alert message={servicesError} />{/if}

      {#if servicesLoading}
        <Card padding="none">
          {#each [0, 1, 2, 3, 4] as i (i)}
            <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
              <Skeleton class="h-2 w-2 rounded-full shrink-0" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-3 w-48" />
                <Skeleton class="h-2.5 w-72 max-w-full" />
              </div>
            </div>
          {/each}
        </Card>
      {:else if services.length === 0}
        <EmptyState icon={Server} title={serviceSearch ? 'No services match' : 'No loaded services'} message={serviceSearch ? 'Nothing matches the current search.' : 'systemd reported no loaded services.'}>
          {#snippet action()}
            {#if serviceSearch}
              <Button variant="secondary" size="sm" onclick={() => onSearch('')}>Clear search</Button>
            {/if}
          {/snippet}
        </EmptyState>
      {:else}
        <p class="text-xs text-muted-foreground">{services.length} services</p>
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each services as svc (svc.name)}
            {@const busy = actioning[svc.name]}
            {@const canToggleEnable = svc.enabledState === 'enabled' || svc.enabledState === 'disabled'}
            <div class="px-4 py-2.5 flex items-center gap-3 {busy ? 'opacity-60' : ''}">
              <span class="w-2 h-2 rounded-full shrink-0 {dotColor(svc.sub)}"></span>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[13px] font-mono truncate" id="svc-{svc.name}-label">{svc.name.replace('.service', '')}</span>
                  {#if !canToggleEnable}
                    <span class="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">{svc.enabledState}</span>
                  {/if}
                  <span class="text-xs {subColor(svc.sub)}">{svc.sub}</span>
                </div>
                {#if svc.description}
                  <p class="text-xs text-muted-foreground truncate">{svc.description}</p>
                {/if}
              </div>

              <div class="flex items-center gap-1 shrink-0">
                {#if svc.active === 'active'}
                  <Button variant="icon" size="sm" aria-label="Restart {svc.name}" class="hover:text-status-warn" disabled={!!busy} onclick={() => requestAction(svc, 'restart')}>
                    <RotateCcw size={13} />
                  </Button>
                  <Button variant="icon" size="sm" aria-label="Stop {svc.name}" class="hover:text-status-fail" disabled={!!busy} onclick={() => requestAction(svc, 'stop')}>
                    <Square size={13} />
                  </Button>
                {:else}
                  <Button variant="icon" size="sm" aria-label="Start {svc.name}" class="hover:text-status-ok" disabled={!!busy} onclick={() => requestAction(svc, 'start')}>
                    <Play size={13} />
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
      {/if}
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
      { label: pendingUnit ? pendingUnit.action[0].toUpperCase() + pendingUnit.action.slice(1) : 'Continue', variant: 'destructive', onClick: () => runAction(pendingUnit!.svc, pendingUnit!.action) },
    ]}
  />
</Page>
