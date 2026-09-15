<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, Dialog, EmptyState } from '$ui'
  import { toasts } from '$stores/toasts'
  import { refreshBadges } from '$stores/badges'
  import Alert from '$lib/Alert.svelte'
  import {
    RefreshCw, CheckCircle2, Download, ChevronDown, ChevronUp,
    ShieldAlert, Package, FileText, Loader2, Trash2
  } from 'lucide-svelte'

  type PackageUpdate = {
    name: string
    currentVersion: string
    newVersion: string
    size: string
    isSecurity: boolean
    source: string
  }

  type UpdateStatus = {
    packages: PackageUpdate[]
    rebootRequired: boolean
    runningKernel: string
    kernelUpdateAvailable: boolean
    lastCheck: string
  }

  type PackageHealth = {
    upgradable: number; autoremovable: string[]; cacheBytes: number; installedCount: number
  }

  const labelCls = 'text-[11px] text-muted-foreground uppercase tracking-wide'

  let status = $state<UpdateStatus | null>(null)
  let loading = $state(true)
  let checking = $state(false)
  let error = $state('')

  // Upgrade state
  let upgrading = $state(false)
  let upgradeProgress = $state('')
  let upgradeOutput = $state('')
  let selectedPackages = $state<Set<string>>(new Set())
  let upgradePhase = $state<'download' | 'unpack' | 'configure' | 'cleanup' | null>(null)
  let currentPackage = $state<string | null>(null)
  let lastOutputAt = $state<number | null>(null)
  let upgradeStartedAt = $state<number | null>(null)

  // Changelog dialog
  let changelogPkg = $state<string | null>(null)
  let changelogContent = $state('')
  let changelogLoading = $state(false)

  // Expand sections
  let expandSecurity = $state(true)
  let expandRegular = $state(false)

  // Package status (moved here from System info)
  let pkgHealth = $state<PackageHealth | null>(null)
  let pkgHealthLoading = $state(true)
  let pkgHealthError = $state('')

  async function loadPackageHealth() {
    pkgHealthLoading = true; pkgHealthError = ''
    try { pkgHealth = await invoke<PackageHealth>('system:packageHealth') }
    catch (e) { pkgHealthError = formatError(e) }
    finally { pkgHealthLoading = false }
  }

  async function fetchStatus() {
    status = await invoke<UpdateStatus>('updates:check')
    // Auto-select security packages
    if (status) {
      selectedPackages = new Set(status.packages.filter(p => p.isSecurity).map(p => p.name))
    }
  }

  async function load() {
    loading = true; error = ''
    void loadPackageHealth()
    try {
      await fetchStatus()
    } catch (e) {
      error = formatError(e)
    } finally {
      loading = false
    }
  }

  async function check() {
    checking = true; error = ''
    void loadPackageHealth()
    try {
      await fetchStatus()
    } catch (e) {
      error = formatError(e)
    } finally {
      checking = false
    }
  }

  function resetUpgradeState(message: string) {
    error = ''; upgradeOutput = ''; upgrading = true; upgradeProgress = message
    upgradePhase = 'download'; currentPackage = null; lastOutputAt = null
    upgradeStartedAt = Date.now()
  }

  function finishUpgrade(success: boolean, message: string) {
    upgrading = false
    upgradeProgress = message
    if (success) {
      toasts.success(message, 'Updates')
      void refreshBadges()
    } else {
      toasts.error(message || 'Upgrade failed', 'Updates')
    }
  }

  async function upgradeAll() {
    if (!status || status.packages.length === 0) return
    const before = status.packages.length
    resetUpgradeState('Upgrading all packages…')
    try {
      await invoke('updates:upgrade')
      await load()
      const remaining = status?.packages.length ?? 0
      if (remaining === 0) {
        finishUpgrade(true, 'Upgrade complete!')
      } else {
        finishUpgrade(
          true,
          `Upgraded ${before - remaining} of ${before} — ${remaining} still need attention (see below)`
        )
      }
    } catch (e) {
      error = formatError(e)
      finishUpgrade(false, 'Upgrade failed')
    }
  }

  async function upgradeSelected() {
    if (selectedPackages.size === 0) return
    const targeted = Array.from(selectedPackages)
    resetUpgradeState(`Upgrading ${targeted.length} package${targeted.length === 1 ? '' : 's'}…`)
    try {
      await invoke('updates:upgrade', targeted)
      await load()
      const remainingNames = new Set(status?.packages.map(p => p.name) ?? [])
      const stillPending = targeted.filter(n => remainingNames.has(n))
      if (stillPending.length === 0) {
        finishUpgrade(true, 'Upgrade complete!')
      } else {
        finishUpgrade(
          true,
          `Upgraded ${targeted.length - stillPending.length} of ${targeted.length} — ${stillPending.join(', ')} still pending`
        )
      }
    } catch (e) {
      error = formatError(e)
      finishUpgrade(false, 'Upgrade failed')
    }
  }

  async function showChangelog(pkg: string) {
    changelogPkg = pkg
    changelogLoading = true
    changelogContent = ''
    try {
      const res = await invoke<{ changelog: string }>('updates:changelog', pkg)
      changelogContent = res.changelog || 'No changelog available'
    } catch {
      changelogContent = 'Failed to load changelog'
    } finally {
      changelogLoading = false
    }
  }

  function togglePackage(name: string) {
    const next = new Set(selectedPackages)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedPackages = next
  }

  function selectAll(packages: PackageUpdate[]) {
    selectedPackages = new Set([...selectedPackages, ...packages.map(p => p.name)])
  }

  function formatError(value: unknown): string {
    const message = value instanceof Error ? value.message : String(value)
    return message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
  }

  function formatElapsed(startedAt: number | null): string {
    if (!startedAt) return ''
    const s = Math.round((Date.now() - startedAt) / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}m ${r.toString().padStart(2, '0')}s`
  }

  function fmtBytes(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  function parseProgress(output: string) {
    lastOutputAt = Date.now()
    // Look at the last meaningful lines of output
    const lines = output.trim().split('\n')
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
      const line = lines[i]
      if (!line) continue

      // "Get:1 https://... cursor amd64 1.2.3 [123 MB]"
      const getMatch = line.match(/^Get:\d+\s+\S+\s+(\S+)/)
      if (getMatch) {
        currentPackage = getMatch[1]
        upgradePhase = 'download'
        return
      }

      // "Preparing to unpack .../package_..."
      const unpackMatch = line.match(/Preparing to unpack .*?\/([^/]+?)_\d/)
      if (unpackMatch) {
        currentPackage = unpackMatch[1]
        upgradePhase = 'unpack'
        return
      }

      // "Unpacking package ..."
      const unpackingMatch = line.match(/^Unpacking\s+(\S+)/)
      if (unpackingMatch) {
        currentPackage = unpackingMatch[1]
        upgradePhase = 'unpack'
        return
      }

      // "Setting up package ..."
      const setupMatch = line.match(/^Setting up\s+(\S+)/)
      if (setupMatch) {
        currentPackage = setupMatch[1]
        upgradePhase = 'configure'
        return
      }

      // "Processing triggers for package ..."
      const triggerMatch = line.match(/^Processing triggers for\s+(\S+)/)
      if (triggerMatch) {
        currentPackage = triggerMatch[1]
        upgradePhase = 'cleanup'
        return
      }
    }
  }

  const phaseLabel: Record<NonNullable<typeof upgradePhase>, string> = {
    download: 'Downloading',
    unpack: 'Unpacking',
    configure: 'Setting up',
    cleanup: 'Finishing',
  }

  onMount(() => {
    void load()
    return window.electronAPI.onUpdatesProgress((output) => {
      upgradeOutput = (upgradeOutput + output).slice(-20000)
      parseProgress(upgradeOutput)
    })
  })

  const securityPackages = $derived(status?.packages.filter(p => p.isSecurity) ?? [])
  const regularPackages = $derived(status?.packages.filter(p => !p.isSecurity) ?? [])
</script>

{#snippet packageRow(pkg: PackageUpdate)}
  <div class="flex items-center gap-3 px-4 py-3">
    <input
      type="checkbox"
      checked={selectedPackages.has(pkg.name)}
      onchange={() => togglePackage(pkg.name)}
      aria-label="Select {pkg.name}"
      class="rounded border-border bg-secondary"
    />
    <div class="flex-1 min-w-0">
      <p class="text-[13px] font-medium truncate">{pkg.name}</p>
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{pkg.currentVersion} → {pkg.newVersion}</span>
        <span>·</span>
        <span>{pkg.size}</span>
      </div>
    </div>
    <Button
      variant="icon"
      size="sm"
      aria-label="View changelog for {pkg.name}"
      onclick={() => showChangelog(pkg.name)}
    >
      <FileText size={14} />
    </Button>
  </div>
{/snippet}

{#snippet packageSection(
  title: string,
  packages: PackageUpdate[],
  expanded: boolean,
  toggle: () => void,
  icon: 'security' | 'regular',
)}
  <Card padding="none" class="overflow-hidden">
    <div class="flex items-center gap-2 pr-2">
      <button
        type="button"
        onclick={toggle}
        aria-expanded={expanded}
        class="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))] transition-colors"
      >
        {#if icon === 'security'}
          <ShieldAlert size={18} class="text-status-warn shrink-0" />
        {:else}
          <Package size={18} class="text-muted-foreground shrink-0" />
        {/if}
        <span class="text-[13px] font-medium flex-1">{title} ({packages.length})</span>
        {#if expanded}
          <ChevronUp size={16} class="text-muted-foreground shrink-0" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground shrink-0" />
        {/if}
      </button>
      <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => selectAll(packages)}>
        Select all
      </Button>
    </div>
    {#if expanded}
      <div class="divide-y divide-border border-t border-border">
        {#each packages as pkg (pkg.name)}
          {@render packageRow(pkg)}
        {/each}
      </div>
    {/if}
  </Card>
{/snippet}

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Check for updates"
      disabled={checking || loading || upgrading}
      onclick={check}
    >
      <RefreshCw size={14} class={checking ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if upgrading || upgradeProgress}
      <Card padding="sm" class="space-y-2">
        <div class="flex items-center justify-between gap-3 text-[13px]">
          <div class="flex items-center gap-2 min-w-0">
            {#if upgrading}<Loader2 size={14} class="animate-spin text-primary shrink-0" />{/if}
            <span class="font-medium truncate">{upgradeProgress}</span>
          </div>
          {#if upgrading && upgradeStartedAt}
            <span class="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {formatElapsed(upgradeStartedAt)}
            </span>
          {/if}
        </div>

        {#if upgrading}
          <div class="flex flex-wrap items-center gap-2 text-xs">
            {#if upgradePhase && currentPackage}
              <span class="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                {phaseLabel[upgradePhase]} <span class="font-mono text-primary">{currentPackage}</span>
              </span>
            {:else}
              <span class="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Preparing…</span>
            {/if}
            {#if lastOutputAt}
              {@const idleSec = Math.round((Date.now() - lastOutputAt) / 1000)}
              <span class="text-muted-foreground">
                last output {idleSec < 5 ? 'just now' : `${idleSec}s ago`}
              </span>
            {/if}
          </div>
          <p class="text-[11px] text-muted-foreground">
            Large downloads can take several minutes. If the timer keeps advancing, the upgrade is still in progress.
          </p>
        {/if}

        {#if upgradeOutput}
          <pre class="max-h-48 overflow-y-auto rounded-md bg-black/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono">{upgradeOutput}</pre>
        {/if}
      </Card>
    {/if}

    {#if loading}
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-12 w-full" />
    {:else if status}
      {#if status.rebootRequired}
        <Alert variant="warn" message="A restart is required to finish applying updates." />
      {/if}

      {#if status.packages.length === 0}
        <EmptyState
          icon={CheckCircle2}
          title="System is up to date"
          message="Kernel {status.runningKernel}"
        />
      {:else}
        <!-- Status summary card -->
        <Card>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <Download size={24} class="shrink-0 {securityPackages.length > 0 ? 'text-status-warn' : 'text-primary'}" />
              <div class="min-w-0">
                <p class="text-[13px] font-medium">{status.packages.length} update{status.packages.length === 1 ? '' : 's'} available</p>
                {#if securityPackages.length > 0}
                  <p class="text-xs text-status-warn">{securityPackages.length} security update{securityPackages.length === 1 ? '' : 's'}</p>
                {:else}
                  <p class="text-xs text-muted-foreground">Kernel {status.runningKernel}</p>
                {/if}
              </div>
            </div>

            {#if !upgrading}
              <div class="flex items-center gap-2 shrink-0">
                {#if selectedPackages.size > 0}
                  <Button variant="primary" size="sm" onclick={upgradeSelected}>
                    Upgrade {selectedPackages.size}
                  </Button>
                {/if}
                <Button variant="secondary" size="sm" onclick={upgradeAll}>
                  Upgrade All
                </Button>
              </div>
            {/if}
          </div>
          <p class="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/60">
            Upgrade All also installs updates deferred by phased rollout or held back for new dependencies.
          </p>
        </Card>
      {/if}

      {#if securityPackages.length > 0}
        {@render packageSection(
          'Security Updates',
          securityPackages,
          expandSecurity,
          () => { expandSecurity = !expandSecurity },
          'security',
        )}
      {/if}

      {#if regularPackages.length > 0}
        {@render packageSection(
          'Regular Updates',
          regularPackages,
          expandRegular,
          () => { expandRegular = !expandRegular },
          'regular',
        )}
      {/if}
    {/if}

    <!-- Package status (moved here from System info) -->
    <div class="space-y-2">
      <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">Package status</p>
      {#if pkgHealthLoading && !pkgHealth}
        <Skeleton class="h-24 w-full" />
      {:else if pkgHealth}
        <Card class="space-y-3">
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
              <p class={labelCls}>Installed</p>
              <p class="text-[13px] font-medium tabular-nums mt-0.5">{pkgHealth.installedCount}</p>
            </div>
            <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
              <p class={labelCls}>Upgradable</p>
              <p class="text-[13px] font-medium tabular-nums mt-0.5">{pkgHealth.upgradable}</p>
            </div>
            <div class="rounded-md bg-secondary/40 px-2.5 py-1.5">
              <p class={labelCls}>Cache size</p>
              <p class="text-[13px] font-medium tabular-nums mt-0.5">{fmtBytes(pkgHealth.cacheBytes)}</p>
            </div>
          </div>
          {#if pkgHealth.autoremovable.length > 0}
            <div class="border-t border-border pt-3">
              <p class="{labelCls} font-medium mb-1.5 flex items-center gap-1.5">
                <Trash2 size={11} />
                {pkgHealth.autoremovable.length} package{pkgHealth.autoremovable.length === 1 ? '' : 's'} no longer needed
              </p>
              <p class="text-[11px] text-muted-foreground leading-relaxed">{pkgHealth.autoremovable.join(', ')}</p>
            </div>
          {/if}
        </Card>
      {:else if pkgHealthError}
        <Alert message={pkgHealthError} />
      {/if}
    </div>
  </div>

  <Dialog
    open={changelogPkg !== null}
    onOpenChange={(open) => { if (!open) changelogPkg = null }}
    title="{changelogPkg ?? ''} — Changelog"
    class="max-w-lg"
  >
    <div class="max-h-[60vh] overflow-y-auto">
      {#if changelogLoading}
        <div class="space-y-2">
          <Skeleton class="h-3 w-3/4" />
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-5/6" />
          <Skeleton class="h-3 w-2/3" />
        </div>
      {:else}
        <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{changelogContent}</pre>
      {/if}
    </div>
    <div class="flex justify-end pt-1">
      <Button variant="secondary" size="sm" onclick={() => changelogPkg = null}>Close</Button>
    </div>
  </Dialog>
</Page>
