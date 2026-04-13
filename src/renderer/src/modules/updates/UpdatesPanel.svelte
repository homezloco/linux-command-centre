<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
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
  let selectedPackages = $state<Set<string>>(new Set())

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

  async function upgradeAll() {
    if (!status || status.packages.length === 0) return
    upgrading = true; upgradeProgress = 'Upgrading all packages…'
    try {
      await invoke('updates:upgrade')
      await load()
      upgradeProgress = 'Upgrade complete!'
    } catch (e) {
      error = String(e)
      upgradeProgress = ''
    } finally {
      upgrading = false
    }
  }

  async function upgradeSelected() {
    if (selectedPackages.size === 0) return
    upgrading = true; upgradeProgress = `Upgrading ${selectedPackages.size} packages…`
    try {
      await invoke('updates:upgrade', Array.from(selectedPackages))
      await load()
      upgradeProgress = 'Upgrade complete!'
    } catch (e) {
      error = String(e)
      upgradeProgress = ''
    } finally {
      upgrading = false
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

  onMount(load)

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
            <button
              onclick={(e) => { e.stopPropagation(); selectAll(securityPackages, true) }}
              class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
            >
              Select all
            </button>
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
            <button
              onclick={(e) => { e.stopPropagation(); selectAll(regularPackages, true) }}
              class="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
            >
              Select all
            </button>
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
