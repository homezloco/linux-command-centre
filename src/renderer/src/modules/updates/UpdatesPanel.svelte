<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import {
    RefreshCw, CheckCircle, AlertCircle, Download, ChevronDown, ChevronUp,
    ShieldAlert, Package, FileText, RotateCw, Loader2, Power
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

  // Changelog modal
  let changelogPkg = $state<string | null>(null)
  let changelogContent = $state('')
  let changelogLoading = $state(false)

  // Expand sections
  let expandSecurity = $state(true)
  let expandRegular = $state(false)

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<UpdateStatus>('updates:check')
      // Auto-select security packages
      if (status) {
        selectedPackages = new Set(status.packages.filter(p => p.isSecurity).map(p => p.name))
      }
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  async function check() {
    checking = true; error = ''
    try {
      status = await invoke<UpdateStatus>('updates:check')
      if (status) {
        selectedPackages = new Set(status.packages.filter(p => p.isSecurity).map(p => p.name))
      }
    } catch (e) {
      error = String(e)
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
    } catch (e) {
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

  function selectAll(packages: PackageUpdate[], select: boolean) {
    if (select) {
      selectedPackages = new Set([...selectedPackages, ...packages.map(p => p.name)])
    } else {
      const toRemove = new Set(packages.map(p => p.name))
      selectedPackages = new Set([...selectedPackages].filter(x => !toRemove.has(x)))
    }
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

  let upgradeStartedAt = $state<number | null>(null)

  onMount(() => {
    void load()
    const api = (window as unknown as Window & {
      electronAPI: { onUpdatesProgress: (callback: (output: string) => void) => () => void }
    }).electronAPI
    return api.onUpdatesProgress((output) => {
      upgradeOutput = (upgradeOutput + output).slice(-20000)
      parseProgress(upgradeOutput)
    })
  })

  const securityPackages = $derived(status?.packages.filter(p => p.isSecurity) ?? [])
  const regularPackages = $derived(status?.packages.filter(p => !p.isSecurity) ?? [])
</script>

<div class="max-w-2xl space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Package size={18} class="text-primary" />
      <span class="text-sm font-medium">System Updates</span>
    </div>
    <button
      onclick={check}
      disabled={checking || loading}
      class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border
             hover:bg-secondary transition-colors disabled:opacity-50"
    >
      <RefreshCw size={11} class={checking ? 'animate-spin' : ''} />
      {checking ? 'Checking…' : 'Refresh'}
    </button>
  </div>

  {#if error}
    <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
      <p class="text-sm text-destructive flex items-center gap-2">
        <AlertCircle size={14} />
        {error}
      </p>
    </div>
  {/if}

  {#if upgrading || upgradeProgress}
    <div class="rounded-xl border border-border bg-card p-3 space-y-2">
      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="flex items-center gap-2 min-w-0">
          {#if upgrading}<Loader2 size={14} class="animate-spin text-primary shrink-0" />{/if}
          <span class="font-medium truncate">{upgradeProgress}</span>
        </div>
        {#if upgrading && upgradeStartedAt}
          <span class="text-[10px] tabular-nums text-muted-foreground shrink-0">
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
        <p class="text-[10px] text-muted-foreground">
          Large downloads can take several minutes. If the timer keeps advancing, the upgrade is still in progress.
        </p>
      {/if}

      {#if upgradeOutput}
        <pre class="max-h-48 overflow-y-auto rounded-md bg-black/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono">{upgradeOutput}</pre>
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="h-48 flex items-center justify-center text-muted-foreground">
      <Loader2 size={20} class="animate-spin mr-2" />
      Checking for updates…
    </div>
  {:else if status}

    <!-- Status summary card -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          {#if status.packages.length === 0}
            <CheckCircle size={24} class="text-green-400" />
            <div>
              <p class="text-sm font-medium">System is up to date</p>
              <p class="text-xs text-muted-foreground">Kernel {status.runningKernel}</p>
            </div>
          {:else}
            <Download size={24} class={securityPackages.length > 0 ? 'text-yellow-400' : 'text-primary'} />
            <div>
              <p class="text-sm font-medium">{status.packages.length} update{status.packages.length === 1 ? '' : 's'} available</p>
              {#if securityPackages.length > 0}
                <p class="text-xs text-yellow-400">{securityPackages.length} security update{securityPackages.length === 1 ? '' : 's'}</p>
              {:else}
                <p class="text-xs text-muted-foreground">Kernel {status.runningKernel}</p>
              {/if}
            </div>
          {/if}
        </div>

        {#if status.packages.length > 0 && !upgrading}
          <div class="flex items-center gap-2">
            {#if selectedPackages.size > 0}
              <button
                onclick={upgradeSelected}
                class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium
                       hover:bg-primary/90 transition-colors"
              >
                Upgrade {selectedPackages.size}
              </button>
            {/if}
            <button
              onclick={upgradeAll}
              title="Full upgrade — also installs updates normally deferred by phased rollout or held back for new dependencies"
              class="px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors"
            >
              Upgrade All
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Security updates section -->
    {#if securityPackages.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onclick={() => expandSecurity = !expandSecurity}
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <ShieldAlert size={18} class="text-yellow-400" />
            <span class="text-sm font-medium">Security Updates ({securityPackages.length})</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              role="button" tabindex="0"
              onclick={(e) => { e.stopPropagation(); selectAll(securityPackages, true) }}
              onkeydown={(e) => e.key === 'Enter' && selectAll(securityPackages, true)}
              class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded cursor-pointer"
            >
              Select all
            </span>
            {#if expandSecurity}
              <ChevronUp size={16} class="text-muted-foreground" />
            {:else}
              <ChevronDown size={16} class="text-muted-foreground" />
            {/if}
          </div>
        </button>

        {#if expandSecurity}
          <div class="divide-y divide-border border-t border-border">
            {#each securityPackages as pkg}
              <div class="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedPackages.has(pkg.name)}
                  onchange={() => togglePackage(pkg.name)}
                  class="rounded border-border bg-secondary"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{pkg.name}</p>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{pkg.currentVersion} → {pkg.newVersion}</span>
                    <span>·</span>
                    <span>{pkg.size}</span>
                  </div>
                </div>
                <button
                  onclick={() => showChangelog(pkg.name)}
                  class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="View changelog"
                >
                  <FileText size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Regular updates section -->
    {#if regularPackages.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onclick={() => expandRegular = !expandRegular}
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <Package size={18} class="text-muted-foreground" />
            <span class="text-sm font-medium">Regular Updates ({regularPackages.length})</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              role="button" tabindex="0"
              onclick={(e) => { e.stopPropagation(); selectAll(regularPackages, true) }}
              onkeydown={(e) => e.key === 'Enter' && selectAll(regularPackages, true)}
              class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded cursor-pointer"
            >
              Select all
            </span>
            {#if expandRegular}
              <ChevronUp size={16} class="text-muted-foreground" />
            {:else}
              <ChevronDown size={16} class="text-muted-foreground" />
            {/if}
          </div>
        </button>

        {#if expandRegular}
          <div class="divide-y divide-border border-t border-border">
            {#each regularPackages as pkg}
              <div class="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedPackages.has(pkg.name)}
                  onchange={() => togglePackage(pkg.name)}
                  class="rounded border-border bg-secondary"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{pkg.name}</p>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{pkg.currentVersion} → {pkg.newVersion}</span>
                    <span>·</span>
                    <span>{pkg.size}</span>
                  </div>
                </div>
                <button
                  onclick={() => showChangelog(pkg.name)}
                  class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="View changelog"
                >
                  <FileText size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

  {/if}

  <!-- Changelog Modal -->
  {#if changelogPkg}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <p class="font-medium">{changelogPkg} — Changelog</p>
          <button
            onclick={() => changelogPkg = null}
            class="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div class="p-4 overflow-y-auto flex-1">
          {#if changelogLoading}
            <div class="flex items-center justify-center py-8 text-muted-foreground">
              <RotateCw size={16} class="animate-spin mr-2" />
              Loading…
            </div>
          {:else}
            <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{changelogContent}</pre>
          {/if}
        </div>
        <div class="px-4 py-3 border-t border-border">
          <button
            onclick={() => changelogPkg = null}
            class="px-4 py-2 rounded-md bg-secondary text-sm hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
