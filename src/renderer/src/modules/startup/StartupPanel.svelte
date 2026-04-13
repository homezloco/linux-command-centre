<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import {
    Play, Square, RotateCcw, Plus, Trash2, Power, HardDrive, Server,
    ChevronDown, Check, X, Search, RefreshCw
  } from 'lucide-svelte'

  // ── Types ──────────────────────────────────────────────────────────────────
  type StartupApp = {
    id: string; name: string; comment: string; exec: string
    enabled: boolean; system: boolean; path: string
  }

  type GrubStatus = {
    timeout: number; defaultEntry: string; cmdline: string; timeoutStyle: string
  }

  type Service = {
    name: string; active: string; sub: string; description: string; enabledState: string
  }

  // ── Tab state ─────────────────────────────────────────────────────────────
  let tab = $state<'apps' | 'boot' | 'services'>('apps')

  // ── Startup Apps state ────────────────────────────────────────────────────
  let apps = $state<StartupApp[]>([])
  let appsLoading = $state(true)
  let appsError = $state('')
  let toggling = $state<Record<string, boolean>>({})
  let showAddForm = $state(false)
  let addName = $state('')
  let addExec = $state('')
  let addComment = $state('')
  let addSaving = $state(false)

  // ── App Autostart (self) ───────────────────────────────────────────────────
  let appAutostart = $state<{ enabled: boolean } | null>(null)
  let appAutostartLoading = $state(true)
  let appAutostartToggling = $state(false)

  async function loadAppAutostart() {
    appAutostartLoading = true
    try { appAutostart = await invoke<{ enabled: boolean }>('app:autostartStatus') }
    catch (e) { appsError = String(e) }
    finally { appAutostartLoading = false }
  }

  async function toggleAppAutostart() {
    if (!appAutostart) return
    appAutostartToggling = true
    try {
      await invoke('app:autostartSet', !appAutostart.enabled)
      await loadAppAutostart()
    } catch (e) { appsError = String(e) }
    finally { appAutostartToggling = false }
  }

  async function loadApps() {
    appsLoading = true; appsError = ''
    try { apps = await invoke<StartupApp[]>('startup:list') }
    catch (e) { appsError = String(e) }
    finally { appsLoading = false }
  }

  async function toggleApp(app: StartupApp) {
    toggling = { ...toggling, [app.id]: true }
    try {
      await invoke('startup:toggle', app.id, !app.enabled)
      await loadApps()
    } catch (e) { appsError = String(e) }
    finally { toggling = { ...toggling, [app.id]: false } }
  }

  async function removeApp(app: StartupApp) {
    toggling = { ...toggling, [app.id]: true }
    try {
      await invoke('startup:remove', app.id)
      await loadApps()
    } catch (e) { appsError = String(e) }
    finally { toggling = { ...toggling, [app.id]: false } }
  }

  async function addApp() {
    if (!addName.trim() || !addExec.trim()) return
    addSaving = true
    try {
      await invoke('startup:add', addName.trim(), addExec.trim(), addComment.trim())
      addName = ''; addExec = ''; addComment = ''
      showAddForm = false
      await loadApps()
    } catch (e) { appsError = String(e) }
    finally { addSaving = false }
  }

  // ── GRUB state ────────────────────────────────────────────────────────────
  let grub = $state<GrubStatus | null>(null)
  let grubEntries = $state<string[]>([])
  let grubLoading = $state(true)
  let grubError = $state('')
  let grubSaving = $state(false)
  let grubTimeout = $state(10)
  let grubDefault = $state('0')
  let grubChanged = $derived(
    grub !== null && (grubTimeout !== grub.timeout || grubDefault !== grub.defaultEntry)
  )

  async function loadGrub() {
    grubLoading = true; grubError = ''
    try {
      ;[grub, grubEntries] = await Promise.all([
        invoke<GrubStatus>('grub:status'),
        invoke<string[]>('grub:entries'),
      ])
      if (grub) { grubTimeout = grub.timeout; grubDefault = grub.defaultEntry }
    } catch (e) { grubError = String(e) }
    finally { grubLoading = false }
  }

  async function applyGrub() {
    grubSaving = true; grubError = ''
    try {
      await invoke('grub:set', { GRUB_TIMEOUT: String(grubTimeout), GRUB_DEFAULT: grubDefault })
      await loadGrub()
    } catch (e) { grubError = String(e) }
    finally { grubSaving = false }
  }

  // ── Services state ────────────────────────────────────────────────────────
  let services = $state<Service[]>([])
  let servicesLoading = $state(true)
  let servicesError = $state('')
  let serviceSearch = $state('')
  let actioning = $state<Record<string, string>>({})
  let searchDebounce: ReturnType<typeof setTimeout>

  async function loadServices(q?: string) {
    servicesLoading = true; servicesError = ''
    try { services = await invoke<Service[]>('services:list', q || undefined) }
    catch (e) { servicesError = String(e) }
    finally { servicesLoading = false }
  }

  function onSearchInput() {
    clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => loadServices(serviceSearch), 300)
  }

  async function serviceAction(svc: Service, action: string) {
    actioning = { ...actioning, [svc.name]: action }
    try {
      await invoke('services:action', svc.name, action)
      await loadServices(serviceSearch || undefined)
    } catch (e) { servicesError = String(e) }
    finally {
      actioning = { ...actioning, [svc.name]: '' }
    }
  }

  // ── Tab switching loads data lazily ───────────────────────────────────────
  let bootLoaded = false
  let servicesLoaded = false

  $effect(() => {
    if (tab === 'boot' && !bootLoaded) { bootLoaded = true; loadGrub() }
    if (tab === 'services' && !servicesLoaded) { servicesLoaded = true; loadServices() }
  })

  onMount(() => { loadApps(); loadAppAutostart() })

  // ── Helpers ───────────────────────────────────────────────────────────────
  function subColor(sub: string) {
    if (sub === 'running') return 'text-green-400'
    if (sub === 'exited') return 'text-muted-foreground'
    if (sub === 'failed') return 'text-red-400'
    return 'text-yellow-400'
  }

  function enabledBadge(state: string) {
    if (state === 'enabled') return 'bg-primary/15 text-primary'
    if (state === 'disabled') return 'bg-secondary text-muted-foreground'
    if (state === 'static') return 'bg-secondary text-muted-foreground'
    return 'bg-secondary text-muted-foreground'
  }
</script>

<!-- Tab bar -->
<div class="flex gap-1 mb-5 border-b border-border">
  <button
    onclick={() => tab = 'apps'}
    class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
           {tab === 'apps' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
  >Apps</button>
  <button
    onclick={() => tab = 'boot'}
    class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
           {tab === 'boot' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
  >Boot</button>
  <button
    onclick={() => tab = 'services'}
    class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
           {tab === 'services' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
  >Services</button>
</div>

<!-- ══ STARTUP APPS ══════════════════════════════════════════════════════════ -->
{#if tab === 'apps'}
  <div class="max-w-xl space-y-3">
    <!-- Self autostart card -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <Power size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">Start on login</p>
            <p class="text-xs text-muted-foreground">Launch Command Centre when you log in</p>
          </div>
        </div>
        {#if appAutostartLoading}
          <div class="w-10 h-5 rounded-full bg-secondary animate-pulse"></div>
        {:else if appAutostart}
          <button
            onclick={toggleAppAutostart}
            disabled={appAutostartToggling}
            aria-label="Toggle start on login"
            class="relative w-11 h-6 rounded-full transition-colors disabled:opacity-50
                   {appAutostart.enabled ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                         {appAutostart.enabled ? 'translate-x-5' : ''}"></span>
          </button>
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between pt-2">
      <p class="text-xs text-muted-foreground">Apps that launch automatically at login</p>
      <button
        onclick={() => { showAddForm = !showAddForm; appsError = '' }}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground
               text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus size={13} />Add
      </button>
    </div>

    {#if showAddForm}
      <div class="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
        <p class="text-sm font-medium">New startup entry</p>
        <div class="space-y-2">
          <input bind:value={addName} placeholder="Name"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                   text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <input bind:value={addExec} placeholder="Command (e.g. /usr/bin/nextcloud)"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                   text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <input bind:value={addComment} placeholder="Description (optional)"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                   text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div class="flex gap-2">
          <button onclick={addApp} disabled={addSaving || !addName || !addExec}
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium
                   hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {addSaving ? 'Adding…' : 'Add'}
          </button>
          <button onclick={() => showAddForm = false}
            class="px-3 py-1.5 rounded-md bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors text-xs">
            Cancel
          </button>
        </div>
      </div>
    {/if}

    {#if appsLoading}
      <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
    {:else if appsError}
      <p class="text-xs text-destructive">{appsError}</p>
    {:else if apps.length === 0}
      <p class="text-sm text-muted-foreground">No startup apps found.</p>
    {:else}
      <div class="space-y-1.5">
        {#each apps as app}
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5
                      {toggling[app.id] ? 'opacity-60' : ''}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium truncate">{app.name}</span>
                {#if app.system}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">system</span>
                {/if}
              </div>
              {#if app.comment}
                <p class="text-xs text-muted-foreground truncate">{app.comment}</p>
              {:else if app.exec}
                <p class="text-xs text-muted-foreground truncate font-mono">{app.exec}</p>
              {/if}
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <!-- Toggle -->
              <button
                onclick={() => toggleApp(app)}
                disabled={toggling[app.id]}
                class="relative w-9 h-5 rounded-full transition-colors
                       {app.enabled ? 'bg-primary' : 'bg-secondary border border-border'}"
                title={app.enabled ? 'Disable' : 'Enable'}
              >
                <span class="absolute top-0.5 transition-all rounded-full w-4 h-4 bg-white shadow-sm
                             {app.enabled ? 'left-[18px]' : 'left-0.5'}"></span>
              </button>

              <!-- Remove (user entries only) -->
              {#if !app.system}
                <button onclick={() => removeApp(app)} disabled={toggling[app.id]}
                  class="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Remove">
                  <Trash2 size={13} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

<!-- ══ BOOT / GRUB ════════════════════════════════════════════════════════════ -->
{:else if tab === 'boot'}
  <div class="max-w-sm space-y-4">
    {#if grubLoading}
      <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
    {:else if grub}
      <!-- Timeout -->
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">Boot timeout</p>
        <p class="text-xs text-muted-foreground">Seconds GRUB waits before booting the default entry.</p>
        <div class="flex items-center gap-3">
          <input type="range" min="0" max="30" step="1" bind:value={grubTimeout}
            class="flex-1 accent-primary" />
          <span class="text-sm font-mono w-10 text-right">{grubTimeout}s</span>
        </div>
        {#if grubTimeout === 0}
          <p class="text-xs text-yellow-400">Warning: 0 seconds hides the menu entirely.</p>
        {/if}
      </div>

      <!-- Default OS -->
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">Default OS</p>
        <p class="text-xs text-muted-foreground">Boot entry selected automatically after the timeout.</p>
        {#if grubEntries.length > 0}
          <div class="relative">
            <select bind:value={grubDefault}
              class="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm
                     appearance-none focus:outline-none focus:ring-1 focus:ring-primary pr-8">
              {#each grubEntries as entry, i}
                <option value={String(i)}>{entry}</option>
              {/each}
              <option value="saved">Last booted (saved)</option>
            </select>
            <ChevronDown size={14} class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        {:else}
          <input bind:value={grubDefault} placeholder="0"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm
                   focus:outline-none focus:ring-1 focus:ring-primary" />
          <p class="text-xs text-muted-foreground">Could not read boot entries. Enter index or entry name manually.</p>
        {/if}
      </div>

      <!-- Current cmdline (read-only info) -->
      <div class="rounded-xl border border-border bg-card p-4 space-y-1">
        <p class="text-sm font-medium">Kernel parameters</p>
        <p class="text-xs font-mono text-muted-foreground break-all">{grub.cmdline || '(none)'}</p>
      </div>

      <!-- Apply -->
      <div class="flex items-center gap-3">
        <button onclick={applyGrub} disabled={grubSaving || !grubChanged}
          class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium
                 hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {grubSaving ? 'Applying…' : 'Apply & update-grub'}
        </button>
        {#if grubChanged}
          <button onclick={() => { if (grub) { grubTimeout = grub.timeout; grubDefault = grub.defaultEntry } }}
            class="px-3 py-2 rounded-md bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors">
            Reset
          </button>
        {/if}
      </div>
      {#if grubError}<p class="text-xs text-destructive">{grubError}</p>{/if}
    {:else}
      <p class="text-sm text-muted-foreground">/etc/default/grub not found.</p>
    {/if}
  </div>

<!-- ══ SERVICES ═══════════════════════════════════════════════════════════════ -->
{:else if tab === 'services'}
  <div class="max-w-2xl space-y-3">
    <!-- Search + refresh -->
    <div class="flex gap-2">
      <div class="relative flex-1">
        <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input bind:value={serviceSearch} oninput={onSearchInput}
          placeholder="Search services…"
          class="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-secondary/50 text-sm
                 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <button onclick={() => loadServices(serviceSearch || undefined)}
        class="p-2 rounded-md border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        title="Refresh">
        <RefreshCw size={15} />
      </button>
    </div>

    {#if servicesLoading}
      <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
    {:else if servicesError}
      <p class="text-xs text-destructive">{servicesError}</p>
    {:else if services.length === 0}
      <p class="text-sm text-muted-foreground">
        {serviceSearch ? 'No services match your search.' : 'No loaded services found.'}
      </p>
    {:else}
      <p class="text-xs text-muted-foreground">{services.length} services</p>
      <div class="space-y-1">
        {#each services as svc}
          {@const busy = actioning[svc.name]}
          <div class="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center gap-3
                      {busy ? 'opacity-60' : ''}">
            <!-- Status dot -->
            <span class="w-2 h-2 rounded-full shrink-0
                         {svc.sub === 'running' ? 'bg-green-400' : svc.sub === 'failed' ? 'bg-red-400' : 'bg-muted-foreground/40'}">
            </span>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-mono truncate">{svc.name.replace('.service', '')}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded {enabledBadge(svc.enabledState)} shrink-0">
                  {svc.enabledState}
                </span>
                <span class="text-xs {subColor(svc.sub)}">{svc.sub}</span>
              </div>
              {#if svc.description}
                <p class="text-xs text-muted-foreground truncate">{svc.description}</p>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              {#if svc.active === 'active'}
                <button onclick={() => serviceAction(svc, 'restart')} disabled={!!busy}
                  class="p-1.5 rounded text-muted-foreground hover:text-yellow-400 hover:bg-secondary transition-colors" title="Restart">
                  <RotateCcw size={13} />
                </button>
                <button onclick={() => serviceAction(svc, 'stop')} disabled={!!busy}
                  class="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-secondary transition-colors" title="Stop">
                  <Square size={13} />
                </button>
              {:else}
                <button onclick={() => serviceAction(svc, 'start')} disabled={!!busy}
                  class="p-1.5 rounded text-muted-foreground hover:text-green-400 hover:bg-secondary transition-colors" title="Start">
                  <Play size={13} />
                </button>
              {/if}
              <!-- Enable/Disable toggle -->
              {#if svc.enabledState === 'enabled'}
                <button onclick={() => serviceAction(svc, 'disable')} disabled={!!busy}
                  class="p-1.5 rounded text-primary hover:text-muted-foreground hover:bg-secondary transition-colors" title="Disable at boot">
                  <Power size={13} />
                </button>
              {:else if svc.enabledState === 'disabled'}
                <button onclick={() => serviceAction(svc, 'enable')} disabled={!!busy}
                  class="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors" title="Enable at boot">
                  <Power size={13} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
