<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import {
    RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info,
    GitBranch, Package, Cpu, Plus, Trash2, ExternalLink, X
  } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type DeviceInfo = {
    vendor: string; model: string; version: string; bios: string
    kernel: string; isHuawei: boolean; isMsi: boolean; isLaptop: boolean
  }
  type HwCheck = {
    id: string; label: string
    state: 'ok' | 'warn' | 'fail' | 'info'; detail: string; action?: string
  }
  type IssueItem = {
    id: string; label: string
    type: 'github' | 'kernel' | 'package' | 'local'
    state: 'ok' | 'open' | 'closed' | 'warn' | 'fail' | 'error' | 'unknown'
    detail: string; url?: string; updatedAt?: string; comments?: number
  }
  type IssuesResult = {
    items: IssueItem[]; lastChecked: number
    userIssues: { ref: string; label: string }[]
  }

  let info     = $state<DeviceInfo | null>(null)
  let checks   = $state<HwCheck[]>([])
  let issues   = $state<IssuesResult | null>(null)
  let loading  = $state(true)
  let error    = $state('')
  let issuesLoading  = $state(false)
  let issuesError    = $state('')
  let actionRunning  = $state<string | null>(null)

  // Add issue form
  let showAddForm  = $state(false)
  let addUrl       = $state('')
  let addLabel     = $state('')
  let addError     = $state('')
  let adding       = $state(false)

  async function load() {
    loading = true; error = ''
    try {
      const [i, c] = await Promise.all([
        invoke<DeviceInfo>('device:info'),
        invoke<HwCheck[]>('device:hardwareStatus')
      ])
      info   = i
      checks = c
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function loadIssues(force = false) {
    issuesLoading = true; issuesError = ''
    try {
      issues = await invoke<IssuesResult>('device:knownIssues', force)
    } catch (e) { issuesError = String(e) }
    finally { issuesLoading = false }
  }

  async function runAction(action: string, id: string) {
    actionRunning = id
    try {
      if (action === 'touchpad-rebind') {
        await invoke('touchpad:rebind')
        await load()
      } else if (action === 'camera-rebuild') {
        await invoke('camera:rebuild')
        await load()
      } else if (action === 'camera-load') {
        await invoke('camera:loadModules')
        await load()
      } else if (action === 'rtc-set-utc') {
        await invoke('device:setRtcUtc')
        await load()
      }
    } catch (e) { error = String(e) }
    finally { actionRunning = null }
  }

  function parseIssueUrl(url: string): string | null {
    // Accept: https://github.com/owner/repo/issues/123 or owner/repo/123
    const cleaned = url.replace('https://github.com/', '').replace('github.com/', '')
    const m = cleaned.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/issues\/(\d+)$/)
    if (m) return `${m[1]}/${m[2]}/${m[3]}`
    const m2 = cleaned.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/(\d+)$/)
    if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`
    return null
  }

  async function addIssue() {
    addError = ''
    const ref = parseIssueUrl(addUrl.trim())
    if (!ref) { addError = 'Enter a valid GitHub issue URL or owner/repo/number'; return }
    adding = true
    try {
      await invoke('device:addIssue', ref, addLabel.trim() || ref)
      addUrl = ''; addLabel = ''; showAddForm = false
      await loadIssues(true)
    } catch (e) { addError = String(e) }
    finally { adding = false }
  }

  async function removeIssue(ref: string) {
    try {
      await invoke('device:removeIssue', ref)
      await loadIssues(false)
    } catch { /* ignore */ }
  }

  function fmtDate(ts: number) {
    return new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
  }

  function fmtUpdated(iso?: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' })
  }

  onMount(() => { load(); loadIssues() })
</script>

{#if loading}
  <Spinner />
{:else if error}
  <Alert message={error} />
{:else if info}
  <div class="space-y-5 max-w-2xl">

    <!-- ── Device banner ──────────────────────────────────────────────────── -->
    <div class="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold
                  {info.isHuawei ? 'bg-red-500/10 text-red-400' : info.isMsi ? 'bg-blue-500/10 text-blue-400' : 'bg-secondary text-muted-foreground'}">
        {info.vendor.slice(0, 2).toUpperCase()}
      </div>
      <div class="flex-1 min-w-0 space-y-1">
        <p class="text-base font-semibold leading-tight truncate">{info.model}{info.version && info.version !== info.model ? ` · ${info.version}` : ''}</p>
        <p class="text-xs text-muted-foreground">{info.vendor}</p>
        <div class="flex flex-wrap gap-3 mt-2">
          <span class="flex items-center gap-1 text-xs text-muted-foreground">
            <Cpu size={11} />
            {info.kernel}
          </span>
          {#if info.bios}
            <span class="text-xs text-muted-foreground/60">BIOS {info.bios}</span>
          {/if}
          {#if !info.isLaptop}
            <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">Desktop</span>
          {/if}
          {#if info.isHuawei}
            <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">Huawei</span>
          {:else if info.isMsi}
            <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">MSI</span>
          {/if}
        </div>
      </div>
      <button
        onclick={() => { load(); loadIssues(true) }}
        aria-label="Refresh device status"
        class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <RefreshCw size={14} />
      </button>
    </div>

    <!-- ── Hardware status ────────────────────────────────────────────────── -->
    {#if checks.length > 0}
      <div class="space-y-2">
        <p class="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide px-0.5">Hardware Status</p>
        <div class="rounded-xl border border-border bg-card divide-y divide-border/60">
          {#each checks as check}
            <div class="flex items-center gap-3 px-4 py-2.5">
              <!-- State icon -->
              <div class="shrink-0">
                {#if check.state === 'ok'}
                  <CheckCircle2 size={14} class="text-green-400" />
                {:else if check.state === 'warn'}
                  <AlertTriangle size={14} class="text-yellow-400" />
                {:else if check.state === 'fail'}
                  <XCircle size={14} class="text-red-400" />
                {:else}
                  <Info size={14} class="text-blue-400" />
                {/if}
              </div>

              <!-- Label + detail -->
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium font-mono leading-tight">{check.label}</p>
                <p class="text-[11px] text-muted-foreground leading-snug mt-0.5">{check.detail}</p>
              </div>

              <!-- Action button -->
              {#if check.action}
                <button
                  onclick={() => runAction(check.action!, check.id)}
                  disabled={actionRunning === check.id}
                  class="shrink-0 px-2.5 py-1 rounded-md bg-secondary text-xs font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  {actionRunning === check.id ? '…' : 'Fix'}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Known issues ───────────────────────────────────────────────────── -->
    <div class="space-y-2">
      <div class="flex items-center justify-between px-0.5">
        <p class="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide">Issue Tracker</p>
        <div class="flex items-center gap-2">
          {#if issues?.lastChecked}
            <span class="text-[10px] text-muted-foreground/40">checked {fmtDate(issues.lastChecked)}</span>
          {/if}
          <button
            onclick={() => loadIssues(true)}
            disabled={issuesLoading}
            aria-label="Refresh issues"
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} class={issuesLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onclick={() => { showAddForm = !showAddForm; addError = '' }}
            aria-label="Add issue"
            class="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
          >
            <Plus size={11} />
            Add
          </button>
        </div>
      </div>

      {#if issuesError}
        <Alert message={issuesError} />
      {/if}

      <!-- Add issue form -->
      {#if showAddForm}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <p class="text-xs font-medium">Track a GitHub issue</p>
          {#if addError}<Alert message={addError} />{/if}
          <div class="space-y-2">
            <input
              bind:value={addUrl}
              placeholder="https://github.com/owner/repo/issues/123"
              class="w-full px-3 py-1.5 rounded-md border border-border bg-secondary/50 text-xs font-mono focus:outline-none"
            />
            <input
              bind:value={addLabel}
              placeholder="Label (optional)"
              class="w-full px-3 py-1.5 rounded-md border border-border bg-secondary/50 text-xs focus:outline-none"
            />
          </div>
          <div class="flex gap-2 justify-end">
            <button
              onclick={() => { showAddForm = false; addError = '' }}
              class="px-3 py-1.5 rounded-md bg-secondary text-xs font-medium hover:bg-secondary/80 transition-colors"
            >Cancel</button>
            <button
              onclick={addIssue}
              disabled={adding || !addUrl.trim()}
              class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >{adding ? 'Adding…' : 'Track'}</button>
          </div>
        </div>
      {/if}

      <!-- Issues list -->
      {#if issuesLoading && !issues}
        <Spinner />
      {:else if issues && issues.items.length > 0}
        <div class="rounded-xl border border-border bg-card divide-y divide-border/60">
          {#each issues.items as item}
            {@const isUser = issues.userIssues.some(u => u.ref === item.id)}
            <div class="flex items-start gap-3 px-4 py-3">

              <!-- Type icon -->
              <div class="shrink-0 mt-0.5">
                {#if item.type === 'github'}
                  <GitBranch size={13} class="text-muted-foreground/60" />
                {:else if item.type === 'package'}
                  <Package size={13} class="text-muted-foreground/60" />
                {:else if item.type === 'kernel'}
                  <Cpu size={13} class="text-muted-foreground/60" />
                {:else}
                  <Info size={13} class="text-muted-foreground/60" />
                {/if}
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-xs font-medium leading-tight">{item.label}</p>
                  <!-- State badge -->
                  {#if item.state === 'ok' || item.state === 'closed'}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-green-500/10 text-green-400">
                      {item.state === 'closed' ? 'Closed' : 'OK'}
                    </span>
                  {:else if item.state === 'open'}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-orange-500/10 text-orange-400">Open</span>
                  {:else if item.state === 'warn'}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-yellow-500/10 text-yellow-400">Warn</span>
                  {:else if item.state === 'fail'}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-red-500/10 text-red-400">Fail</span>
                  {:else if item.state === 'error'}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-secondary text-muted-foreground">Error</span>
                  {:else}
                    <span class="text-[10px] font-medium px-1.5 py-px rounded-full bg-secondary text-muted-foreground">Unknown</span>
                  {/if}
                </div>
                <p class="text-[11px] text-muted-foreground leading-snug">{item.detail}</p>
                <div class="flex items-center gap-3 mt-1">
                  {#if item.url}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                    >
                      <ExternalLink size={10} />
                      {item.id}
                    </a>
                  {/if}
                  {#if item.updatedAt}
                    <span class="text-[10px] text-muted-foreground/40">updated {fmtUpdated(item.updatedAt)}</span>
                  {/if}
                  {#if item.comments !== undefined}
                    <span class="text-[10px] text-muted-foreground/40">{item.comments} comments</span>
                  {/if}
                </div>
              </div>

              <!-- Remove button (user issues only) -->
              {#if isUser}
                <button
                  onclick={() => removeIssue(item.id)}
                  aria-label="Remove {item.label}"
                  class="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X size={12} />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {:else if issues}
        <div class="rounded-xl border border-border bg-card p-6 text-center space-y-1">
          <p class="text-sm text-muted-foreground">No issues tracked</p>
          <p class="text-xs text-muted-foreground/50">Add a GitHub issue URL to monitor its status</p>
        </div>
      {/if}
    </div>

  </div>
{/if}
