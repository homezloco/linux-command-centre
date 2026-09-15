<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import {
    ShieldAlert, ShieldCheck, ShieldOff,
    Lock, Unlock, Eye, EyeOff, RefreshCw,
    Terminal, HardDrive, Globe, Users, AlertTriangle,
    CheckCircle2, XCircle, ChevronDown, ChevronUp,
    Power, Bug, ClipboardCheck, Download, Play
  } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'
  import { toasts } from '$stores/toasts'
  import { Page, Skeleton, Button, Toggle, ConfirmDialog } from '$ui'

  const TITLE = 'Security'

  // ── Types ─────────────────────────────────────────────────────────────────
  type FirewallStatus = {
    installed: boolean
    active: boolean
    rules: number
    defaultIncoming: string
    defaultOutgoing: string
  }

  type PortInfo = {
    protocol: string
    port: string
    service: string
    pid?: string
  }

  type LoginAttempt = {
    user: string
    count: number
    latest: string
  }

  type SshStatus = {
    installed: boolean
    running: boolean
    port: number
    passwordAuth: boolean
    rootLogin: boolean
    permitRootLogin?: string
  }

  type EncryptionStatus = {
    encrypted: boolean
    devices: { name: string; type: string; encrypted: boolean }[]
  }

  type AutoUpdatesStatus = {
    installed: boolean
    enabled: boolean
    timerActive: boolean
  }

  type ClamavStatus = {
    installed: boolean
    freshclamActive: boolean
    lastDbUpdate: string | null
  }

  type LynisStatus = {
    installed: boolean
  }

  type LynisResult = {
    hardeningIndex: number | null
    warnings: string[]
    warningsCount: number
    suggestions: string[]
    suggestionsCount: number
  }

  type ScanResult = {
    scanned: number
    infected: number
    clean: boolean
  }

  type SecurityStatus = {
    firewall: FirewallStatus | null
    ports: PortInfo[]
    failedLogins: LoginAttempt[]
    ssh: SshStatus | null
    encryption: EncryptionStatus | null
    securityUpdates: number
    kernelUpdates: boolean
    autoUpdates: AutoUpdatesStatus | null
    clamav: ClamavStatus | null
    lynis: LynisStatus | null
    residualPackages: number
    protocolsBlacklisted: boolean
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let status = $state<SecurityStatus | null>(null)
  let expanded = $state<Record<string, boolean>>({
    firewall: true,
    ports: false,
    ssh: true,
    encryption: true,
    updates: true,
    logins: false,
    autoUpdates: true,
    clamav: false,
    lynis: false
  })

  let firewallToggling = $state(false)
  let sshToggling = $state(false)
  let autoUpdatesToggling = $state(false)
  let installing = $state<Set<string>>(new Set())

  let scanning = $state(false)
  let scanOutput = $state('')
  let scanResult = $state<ScanResult | null>(null)

  // ── ClamAV scan excludes ────────────────────────────────────────────────────
  type ExcludeOption = { id: string; label: string; fragments: string[] }
  const EXCLUDE_OPTIONS: ExcludeOption[] = [
    { id: 'node_modules', label: 'node_modules', fragments: ['node_modules'] },
    { id: 'cache', label: '.cache directories', fragments: ['.cache'] },
    { id: 'git', label: '.git directories', fragments: ['.git'] },
    { id: 'venv', label: 'Python virtualenvs', fragments: ['venv', '.venv'] },
    // `*` suffix = prefix match on the directory name (see ipc.ts), so
    // 'cuttlefish*' covers cuttlefish, cuttlefish-images,
    // cuttlefish_runtime.1, etc.
    { id: 'android', label: 'Android SDK & emulator images', fragments: ['Android', '.android', 'android-studio', 'cuttlefish*'] },
    { id: 'sdkcaches', label: 'Tool caches (.npm, .gradle, …)', fragments: ['.npm', '.gradle', '.m2', '.nvm', '.rustup', '.cargo', 'flutter'] },
    { id: 'dreamos', label: 'dreamos', fragments: ['dreamos'] }
  ]
  const EXCLUDE_STORAGE_KEY = 'lcc-clamav-excludes'
  const CUSTOM_EXCLUDE_STORAGE_KEY = 'lcc-clamav-custom-excludes'
  const SEEN_STORAGE_KEY = 'lcc-clamav-excludes-seen'
  const DEFAULT_EXCLUDES = ['node_modules', 'cache', 'android', 'sdkcaches', 'dreamos']

  let excludeChecked = $state<Set<string>>(new Set(DEFAULT_EXCLUDES))
  let customExcludes = $state<string[]>([])
  let customExcludeInput = $state('')

  function loadExcludePrefs(): void {
    // Options added after the user first saved prefs should still default
    // to checked — `seen` records every option id ever shipped, so a new
    // default is checked once but an explicit uncheck still sticks.
    let seen = new Set<string>()
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY)
      seen = new Set(raw ? JSON.parse(raw) : [])
    } catch { /* non-critical */ }
    try {
      const raw = localStorage.getItem(EXCLUDE_STORAGE_KEY)
      const stored: string[] = raw ? JSON.parse(raw) : DEFAULT_EXCLUDES
      const merged = new Set(stored)
      for (const id of DEFAULT_EXCLUDES) if (!seen.has(id)) merged.add(id)
      excludeChecked = merged
    } catch {
      excludeChecked = new Set(DEFAULT_EXCLUDES)
    }
    for (const o of EXCLUDE_OPTIONS) seen.add(o.id)
    try {
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seen]))
    } catch { /* non-critical */ }
    try {
      const raw = localStorage.getItem(CUSTOM_EXCLUDE_STORAGE_KEY)
      customExcludes = raw ? JSON.parse(raw) : []
    } catch {
      customExcludes = []
    }
  }

  function saveExcludePrefs(): void {
    try {
      localStorage.setItem(EXCLUDE_STORAGE_KEY, JSON.stringify([...excludeChecked]))
      localStorage.setItem(CUSTOM_EXCLUDE_STORAGE_KEY, JSON.stringify(customExcludes))
    } catch { /* non-critical */ }
  }

  function toggleExclude(id: string): void {
    const next = new Set(excludeChecked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    excludeChecked = next
    saveExcludePrefs()
  }

  function addCustomExclude(): void {
    const v = customExcludeInput.trim()
    customExcludeInput = ''
    if (!v || customExcludes.includes(v)) return
    customExcludes = [...customExcludes, v]
    saveExcludePrefs()
  }

  function removeCustomExclude(v: string): void {
    customExcludes = customExcludes.filter((x) => x !== v)
    saveExcludePrefs()
  }

  function computeExcludeFragments(): string[] {
    const fromOptions = EXCLUDE_OPTIONS.filter((o) => excludeChecked.has(o.id)).flatMap((o) => o.fragments)
    return [...fromOptions, ...customExcludes]
  }

  let auditing = $state(false)
  let auditOutput = $state('')
  let lynisResult = $state<LynisResult | null>(null)
  let scanFinishedAt = $state<string | null>(null)
  let auditFinishedAt = $state<string | null>(null)

  let installOutput = $state('')

  let purging = $state(false)
  let blacklisting = $state(false)

  let activeStream = $state<'scan' | 'audit' | 'install' | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      status = await invoke<SecurityStatus>('security:status')
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
      refreshing = false
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function setFirewall(active: boolean) {
    if (!status?.firewall) return
    firewallToggling = true
    try {
      await invoke('firewall:set', active ? 'enable' : 'disable')
      toasts.success(active ? 'Firewall enabled' : 'Firewall disabled', TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      firewallToggling = false
    }
  }

  // Stopping SSH is confirmed (this is where people stop SSH); starting is instant.
  let confirmSshStop = $state(false)

  async function setSsh(running: boolean) {
    if (!status?.ssh) return
    if (!running && !confirmSshStop) { confirmSshStop = true; return }
    sshToggling = true
    try {
      await invoke('ssh:set', running ? 'start' : 'stop')
      toasts.success(running ? 'SSH server started' : 'SSH server stopped', TITLE)
      confirmSshStop = false
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      sshToggling = false
    }
  }

  async function setAutoUpdates(enabled: boolean) {
    if (!status?.autoUpdates) return
    autoUpdatesToggling = true
    try {
      await invoke('security:set-auto-updates', enabled)
      toasts.success(enabled ? 'Automatic security updates enabled' : 'Automatic security updates disabled', TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      autoUpdatesToggling = false
    }
  }

  async function installTool(name: 'clamav' | 'lynis' | 'unattended-upgrades') {
    installing = new Set([...installing, name])
    installOutput = ''
    activeStream = 'install'
    try {
      await invoke('security:install-tool', name)
      toasts.success(`Installed ${name}`, TITLE)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      installing = new Set([...installing].filter(n => n !== name))
      activeStream = null
      // Refresh regardless of outcome: apt-get can succeed even after we report
      // an error (see the timeout note on security:install-tool), so trust the
      // system's actual state over our own error branch.
      await load()
    }
  }

  async function purgeResidualPackages() {
    purging = true
    try {
      await invoke('security:purge-residual')
      toasts.success('Residual packages purged', TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      purging = false
    }
  }

  async function blacklistProtocols() {
    blacklisting = true
    try {
      await invoke('security:blacklist-protocols')
      toasts.success('Unused network protocols blacklisted', TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    } finally {
      blacklisting = false
    }
  }

  async function runClamavScan() {
    scanning = true
    scanOutput = ''
    scanResult = null
    activeStream = 'scan'
    try {
      scanResult = await invoke<ScanResult>('security:clamav-scan', computeExcludeFragments())
      scanFinishedAt = new Date().toISOString()
    } catch (e) {
      error = String(e)
    } finally {
      scanning = false
      activeStream = null
    }
  }

  async function runLynisAudit() {
    auditing = true
    auditOutput = ''
    lynisResult = null
    activeStream = 'audit'
    try {
      lynisResult = await invoke<LynisResult>('security:lynis-audit')
      auditFinishedAt = new Date().toISOString()
    } catch (e) {
      error = String(e)
    } finally {
      auditing = false
      activeStream = null
    }
  }

  type OpState<T> = { running: boolean; output: string; result: T | null; error: string | null; finishedAt: string | null }

  // A scan/audit is a real child process in the main process, independent of
  // whatever Svelte component happens to be watching it — switching tabs (or,
  // during dev, a hot-reload) recreates this component with fresh local state
  // while the operation keeps running underneath. Polling the main process's
  // own state on mount recovers "is something already running, and what did
  // it produce" instead of assuming nothing happened just because this fresh
  // instance never started anything itself.
  async function pollUntilDone<T>(channel: string, onUpdate: (state: OpState<T>) => void): Promise<void> {
    for (;;) {
      const state = await invoke<OpState<T>>(channel)
      onUpdate(state)
      if (!state.running) return
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  function rehydrate(): void {
    pollUntilDone<ScanResult>('security:clamav-scan-status', (s) => {
      scanOutput = s.output
      if (s.running) {
        scanning = true
        activeStream = 'scan'
      } else {
        scanning = false
        if (activeStream === 'scan') activeStream = null
        if (s.result) scanResult = s.result
        else if (s.error) error = s.error
        if (s.finishedAt) scanFinishedAt = s.finishedAt
      }
    }).catch(() => {})

    pollUntilDone<LynisResult>('security:lynis-audit-status', (s) => {
      auditOutput = s.output
      if (s.running) {
        auditing = true
        activeStream = 'audit'
      } else {
        auditing = false
        if (activeStream === 'audit') activeStream = null
        if (s.result) lynisResult = s.result
        else if (s.error) error = s.error
        if (s.finishedAt) auditFinishedAt = s.finishedAt
      }
    }).catch(() => {})
  }

  onMount(() => {
    void load()
    rehydrate()
    loadExcludePrefs()
    return window.electronAPI.onSecurityProgress((output) => {
      if (activeStream === 'scan') scanOutput = (scanOutput + output).slice(-4000)
      else if (activeStream === 'audit') auditOutput = (auditOutput + output).slice(-4000)
      else if (activeStream === 'install') installOutput = (installOutput + output).slice(-4000)
    })
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleSection(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] }
  }
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh security status"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
  {#if error}<Alert message={error} />{/if}

  {#if loading}
    {#each [0, 1, 2, 3, 4, 5] as i (i)}
      <Skeleton class="h-[4.25rem] w-full" />
    {/each}
  {:else if status}

    <!-- Firewall -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors">
        <button
          onclick={() => toggleSection('firewall')}
          class="flex items-center gap-3 flex-1 text-left"
          aria-label="Toggle firewall section"
        >
          {#if status.firewall?.active}
            <ShieldCheck size={18} class="text-status-ok" />
          {:else if status.firewall?.installed}
            <ShieldAlert size={18} class="text-status-warn" />
          {:else}
            <ShieldOff size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-[13px] font-medium">Firewall</p>
            <p class="text-xs text-muted-foreground">
              {#if status.firewall?.active}
                Active · {status.firewall.rules} rules
              {:else if status.firewall?.installed}
                Installed but inactive
              {:else}
                Not installed
              {/if}
            </p>
          </div>
        </button>
        <div class="flex items-center gap-2">
          {#if status.firewall?.installed}
            <Toggle checked={status.firewall.active} disabled={firewallToggling} aria-label="Firewall" onCheckedChange={(v) => setFirewall(v)} />
          {/if}
          <button onclick={() => toggleSection('firewall')} aria-label="Expand firewall" class="text-muted-foreground">
            {#if expanded.firewall}
              <ChevronUp size={16} />
            {:else}
              <ChevronDown size={16} />
            {/if}
          </button>
        </div>
      </div>

      {#if expanded.firewall && status.firewall}
        <div class="px-4 pb-4 pt-1 space-y-2 border-t border-border">
          <div class="grid grid-cols-2 gap-3 text-[13px] pt-2">
            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs text-muted-foreground mb-1">Default Incoming</p>
              <p class="font-medium capitalize">{status.firewall.defaultIncoming}</p>
            </div>
            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs text-muted-foreground mb-1">Default Outgoing</p>
              <p class="font-medium capitalize">{status.firewall.defaultOutgoing}</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Open Ports -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('ports')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          <Globe size={18} class="text-muted-foreground" />
          <div class="text-left">
            <p class="text-[13px] font-medium">Open Ports</p>
            <p class="text-xs text-muted-foreground">
              {status.ports.length} listening {status.ports.length === 1 ? 'port' : 'ports'}
            </p>
          </div>
        </div>
        {#if expanded.ports}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.ports}
        <div class="border-t border-border">
          {#if status.ports.length === 0}
            <div class="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No listening ports found
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.ports as port}
                <div class="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <div class="flex items-center gap-3">
                    <span class="text-xs px-1.5 py-0.5 rounded bg-secondary font-mono">
                      {port.protocol}
                    </span>
                    <span class="font-mono font-medium">{port.port}</span>
                    <span class="text-muted-foreground">{port.service}</span>
                  </div>
                  {#if port.pid}
                    <span class="text-xs text-muted-foreground">PID {port.pid}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- SSH Status -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors">
        <button
          onclick={() => toggleSection('ssh')}
          class="flex items-center gap-3 flex-1 text-left"
          aria-label="Toggle SSH section"
        >
          {#if status.ssh?.running}
            <Terminal size={18} class="text-status-warn" />
          {:else}
            <Terminal size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-[13px] font-medium">SSH Server</p>
            <p class="text-xs text-muted-foreground">
              {#if status.ssh?.running}
                Running on port {status.ssh.port}
              {:else if status.ssh?.installed}
                Installed but not running
              {:else}
                Not installed
              {/if}
            </p>
          </div>
        </button>
        <div class="flex items-center gap-2">
          {#if status.ssh?.installed}
            <Toggle checked={status.ssh.running} disabled={sshToggling} aria-label="SSH server" onCheckedChange={(v) => setSsh(v)} />
          {/if}
          <button onclick={() => toggleSection('ssh')} aria-label="Expand SSH" class="text-muted-foreground">
            {#if expanded.ssh}
              <ChevronUp size={16} />
            {:else}
              <ChevronDown size={16} />
            {/if}
          </button>
        </div>
      </div>

      {#if expanded.ssh && status.ssh?.installed}
        <div class="px-4 pb-4 pt-1 space-y-2 border-t border-border">
          <div class="grid grid-cols-2 gap-3 text-[13px] pt-2">
            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs text-muted-foreground mb-1">Password Auth</p>
              <div class="flex items-center gap-1.5">
                {#if status.ssh.passwordAuth}
                  <XCircle size={14} class="text-status-warn" />
                  <span>Enabled</span>
                {:else}
                  <CheckCircle2 size={14} class="text-status-ok" />
                  <span>Disabled</span>
                {/if}
              </div>
            </div>
            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs text-muted-foreground mb-1">Root Login</p>
              <div class="flex items-center gap-1.5">
                {#if status.ssh.rootLogin}
                  <XCircle size={14} class="text-destructive" />
                  <span class="text-destructive">Enabled</span>
                {:else}
                  <CheckCircle2 size={14} class="text-status-ok" />
                  <span>Disabled</span>
                {/if}
              </div>
            </div>
          </div>
          {#if status.ssh.passwordAuth || status.ssh.rootLogin}
            <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-2.5">
              <p class="text-xs text-status-warn flex items-center gap-1.5">
                <AlertTriangle size={12} />
                {#if status.ssh.rootLogin}
                  Root login enabled — security risk
                {:else}
                  Consider disabling password auth, use keys instead
                {/if}
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Disk Encryption -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('encryption')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if status.encryption?.encrypted}
            <Lock size={18} class="text-status-ok" />
          {:else}
            <Unlock size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-[13px] font-medium">Disk Encryption</p>
            <p class="text-xs text-muted-foreground">
              {#if status.encryption?.encrypted}
                Encrypted
              {:else}
                No encryption detected
              {/if}
            </p>
          </div>
        </div>
        {#if expanded.encryption}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.encryption && status.encryption}
        <div class="border-t border-border">
          {#if status.encryption.devices.length === 0}
            <div class="px-4 py-4 text-center text-[13px] text-muted-foreground">
              No LUKS-encrypted devices detected
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.encryption.devices as dev}
                <div class="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span class="font-mono">{dev.name}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">{dev.type}</span>
                    {#if dev.encrypted}
                      <Lock size={12} class="text-status-ok" />
                    {:else}
                      <Unlock size={12} class="text-muted-foreground" />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Security Updates -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('updates')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if status.securityUpdates > 0 || status.kernelUpdates}
            <AlertTriangle size={18} class="text-status-warn" />
          {:else}
            <CheckCircle2 size={18} class="text-status-ok" />
          {/if}
          <div class="text-left">
            <p class="text-[13px] font-medium">Security Updates</p>
            <p class="text-xs text-muted-foreground">
              {#if status.securityUpdates > 0}
                {status.securityUpdates} pending
              {:else if status.kernelUpdates}
                Kernel update available
              {:else}
                Up to date
              {/if}
            </p>
          </div>
        </div>
        {#if expanded.updates}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.updates && (status.securityUpdates > 0 || status.kernelUpdates)}
        <div class="px-4 py-3 border-t border-border">
          <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-3">
            <p class="text-[13px] text-status-warn flex items-center gap-2">
              <AlertTriangle size={14} />
              {#if status.securityUpdates > 0}
                {status.securityUpdates} security {status.securityUpdates === 1 ? 'update is' : 'updates are'} pending
              {:else}
                Kernel update available — reboot required after install
              {/if}
            </p>
            <p class="text-xs text-muted-foreground mt-1.5 ml-6">
              Go to Updates tab to install
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Failed Login Attempts -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('logins')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if status.failedLogins.length > 0}
            <Users size={18} class="text-destructive" />
          {:else}
            <Users size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-[13px] font-medium">Failed Logins</p>
            <p class="text-xs text-muted-foreground">
              {#if status.failedLogins.length > 0}
                {status.failedLogins.reduce((acc, l) => acc + l.count, 0)} failed attempts
              {:else}
                No recent failures
              {/if}
            </p>
          </div>
        </div>
        {#if expanded.logins}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.logins}
        <div class="border-t border-border">
          {#if status.failedLogins.length === 0}
            <div class="px-4 py-4 text-center text-[13px] text-muted-foreground">
              No failed login attempts in the last 7 days
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.failedLogins as login}
                <div class="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span class="font-mono">{login.user}</span>
                  <div class="text-right">
                    <p class="text-xs text-muted-foreground">{login.count} attempts</p>
                    <p class="text-[11px] text-muted-foreground">Latest: {login.latest}</p>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Automatic Security Updates -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors">
        <button
          onclick={() => toggleSection('autoUpdates')}
          class="flex items-center gap-3 flex-1 text-left"
          aria-label="Toggle automatic updates section"
        >
          <RefreshCw size={18} class={status.autoUpdates?.enabled ? 'text-status-ok' : status.autoUpdates?.installed ? 'text-status-warn' : 'text-muted-foreground'} />
          <div class="text-left">
            <p class="text-[13px] font-medium">Automatic Security Updates</p>
            <p class="text-xs text-muted-foreground">
              {#if status.autoUpdates?.enabled}
                Enabled{status.autoUpdates.timerActive ? '' : ' · timer inactive'}
              {:else if status.autoUpdates?.installed}
                Installed but disabled
              {:else}
                Not installed
              {/if}
            </p>
          </div>
        </button>
        <div class="flex items-center gap-2">
          {#if status.autoUpdates?.installed}
            <Toggle checked={status.autoUpdates.enabled} disabled={autoUpdatesToggling} aria-label="Automatic security updates" onCheckedChange={(v) => setAutoUpdates(v)} />
          {:else}
            <button
              onclick={() => installTool('unattended-upgrades')}
              disabled={installing.has('unattended-upgrades')}
              class="text-xs px-2 py-1 rounded-md border border-border hover:bg-secondary transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Download size={12} />
              {installing.has('unattended-upgrades') ? 'Installing…' : 'Install'}
            </button>
          {/if}
          <button onclick={() => toggleSection('autoUpdates')} aria-label="Expand automatic updates" class="text-muted-foreground">
            {#if expanded.autoUpdates}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
          </button>
        </div>
      </div>

      {#if expanded.autoUpdates && status.autoUpdates?.installed && !status.autoUpdates.enabled}
        <div class="px-4 pb-4 pt-1 border-t border-border">
          <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-2.5 mt-2">
            <p class="text-xs text-status-warn flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Security patches won't install themselves until this is enabled
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- ClamAV -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('clamav')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          <Bug size={18} class={scanResult && scanResult.infected > 0 ? 'text-destructive' : status.clamav?.installed ? 'text-status-ok' : 'text-muted-foreground'} />
          <div class="text-left">
            <p class="text-[13px] font-medium">Antivirus (ClamAV)</p>
            <p class="text-xs text-muted-foreground">
              {#if scanning}
                Scanning home directory…
              {:else if scanResult}
                {scanResult.infected > 0 ? `${scanResult.infected} infected file(s) found` : `Clean · ${scanResult.scanned.toLocaleString()} files scanned`}{scanFinishedAt ? ` · ${new Date(scanFinishedAt).toLocaleDateString()}` : ''}
              {:else if status.clamav?.installed}
                {status.clamav.lastDbUpdate ? `Definitions updated ${new Date(status.clamav.lastDbUpdate).toLocaleDateString()}` : 'Definitions not yet downloaded'}
              {:else}
                Not installed
              {/if}
            </p>
          </div>
        </div>
        {#if expanded.clamav}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.clamav}
        <div class="px-4 pb-4 pt-1 border-t border-border space-y-2">
          {#if !status.clamav?.installed}
            <button
              onclick={() => installTool('clamav')}
              disabled={installing.has('clamav')}
              class="mt-2 w-full text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download size={12} />
              {installing.has('clamav') ? 'Installing…' : 'Install ClamAV'}
            </button>
            {#if installing.has('clamav') && installOutput}
              <pre class="text-[11px] font-mono bg-secondary/50 rounded-lg p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{installOutput}</pre>
            {/if}
          {:else}
            <div class="flex items-center justify-between pt-2 gap-2">
              <p class="text-xs text-muted-foreground">
                {status.clamav.freshclamActive ? 'Virus definitions auto-update' : 'Definition auto-update service inactive'}
              </p>
              <button
                onclick={runClamavScan}
                disabled={scanning || auditing}
                class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {#if scanning}
                  <RefreshCw size={12} class="animate-spin" />
                  Scanning…
                {:else}
                  <Play size={12} />
                  Scan Home Directory
                {/if}
              </button>
            </div>

            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs font-medium mb-1.5">Skip while scanning</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                {#each EXCLUDE_OPTIONS as opt}
                  <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeChecked.has(opt.id)}
                      onchange={() => toggleExclude(opt.id)}
                      disabled={scanning}
                      class="rounded border-border accent-primary"
                    />
                    {opt.label}
                  </label>
                {/each}
              </div>
              {#if customExcludes.length > 0}
                <div class="flex flex-wrap gap-1.5 mt-2">
                  {#each customExcludes as c}
                    <span class="text-[11px] px-1.5 py-0.5 rounded bg-card border border-border flex items-center gap-1">
                      {c}
                      <button
                        onclick={() => removeCustomExclude(c)}
                        disabled={scanning}
                        aria-label={`Remove ${c}`}
                        class="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >×</button>
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="flex items-center gap-1.5 mt-2">
                <input
                  type="text"
                  bind:value={customExcludeInput}
                  onkeydown={(e) => e.key === 'Enter' && addCustomExclude()}
                  disabled={scanning}
                  placeholder="Folder name to skip (trailing * = prefix)…"
                  class="flex-1 text-xs px-2 py-1 rounded-md border border-border bg-transparent focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <button
                  onclick={addCustomExclude}
                  disabled={scanning}
                  class="text-xs px-2 py-1 rounded-md border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                >Add</button>
              </div>
            </div>

            {#if scanning || scanOutput}
              <pre class="text-[11px] font-mono bg-secondary/50 rounded-lg p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{scanOutput || 'Starting scan…'}</pre>
            {/if}

            {#if scanResult && scanResult.infected > 0}
              <div class="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5">
                <p class="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {scanResult.infected} infected file(s) — see output above for paths
                </p>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Lynis Hardening Audit -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('lynis')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          <ClipboardCheck
            size={18}
            class={!lynisResult ? 'text-muted-foreground' : lynisResult.hardeningIndex !== null && lynisResult.hardeningIndex >= 70 ? 'text-status-ok' : 'text-status-warn'}
          />
          <div class="text-left">
            <p class="text-[13px] font-medium">Hardening Audit (Lynis)</p>
            <p class="text-xs text-muted-foreground">
              {#if auditing}
                Running audit…
              {:else if lynisResult}
                Hardening index {lynisResult.hardeningIndex ?? '—'}/100 · {lynisResult.warningsCount} warning{lynisResult.warningsCount === 1 ? '' : 's'}{auditFinishedAt ? ` · ${new Date(auditFinishedAt).toLocaleDateString()}` : ''}
              {:else if status.lynis?.installed}
                Not yet run
              {:else}
                Not installed
              {/if}
            </p>
          </div>
        </div>
        {#if expanded.lynis}
          <ChevronUp size={16} class="text-muted-foreground" />
        {:else}
          <ChevronDown size={16} class="text-muted-foreground" />
        {/if}
      </button>

      {#if expanded.lynis}
        <div class="px-4 pb-4 pt-1 border-t border-border space-y-2">
          {#if !status.lynis?.installed}
            <button
              onclick={() => installTool('lynis')}
              disabled={installing.has('lynis')}
              class="mt-2 w-full text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download size={12} />
              {installing.has('lynis') ? 'Installing…' : 'Install Lynis'}
            </button>
            {#if installing.has('lynis') && installOutput}
              <pre class="text-[11px] font-mono bg-secondary/50 rounded-lg p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{installOutput}</pre>
            {/if}
          {:else}
            <div class="flex items-center justify-between pt-2 gap-2">
              <p class="text-xs text-muted-foreground">Needs admin password · full audit takes ~1-2 min</p>
              <button
                onclick={runLynisAudit}
                disabled={scanning || auditing}
                class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {#if auditing}
                  <RefreshCw size={12} class="animate-spin" />
                  Auditing…
                {:else}
                  <Play size={12} />
                  Run Audit
                {/if}
              </button>
            </div>

            {#if auditing || auditOutput}
              <pre class="text-[11px] font-mono bg-secondary/50 rounded-lg p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap">{auditOutput || 'Starting audit…'}</pre>
            {/if}

            {#if lynisResult}
              <div class="rounded-lg bg-secondary/50 p-2.5">
                <div class="flex items-center justify-between mb-1">
                  <p class="text-xs text-muted-foreground">Hardening Index</p>
                  <p class="text-[13px] font-medium">{lynisResult.hardeningIndex ?? '—'}/100</p>
                </div>
                {#if lynisResult.hardeningIndex !== null}
                  <div class="w-full h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      class="h-full rounded-full {lynisResult.hardeningIndex >= 70 ? 'bg-status-ok' : lynisResult.hardeningIndex >= 50 ? 'bg-status-warn' : 'bg-destructive'}"
                      style="width: {lynisResult.hardeningIndex}%"
                    ></div>
                  </div>
                {/if}
              </div>

              {#if lynisResult.warnings.length > 0}
                <div class="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5">
                  <p class="text-xs font-medium text-destructive mb-1">
                    {lynisResult.warningsCount} Warning{lynisResult.warningsCount === 1 ? '' : 's'}
                  </p>
                  <ul class="space-y-1 max-h-48 overflow-y-auto">
                    {#each lynisResult.warnings as w}
                      <li class="text-xs text-muted-foreground">• {w}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if lynisResult.suggestions.length > 0}
                <div class="rounded-lg bg-secondary/50 p-2.5">
                  <p class="text-xs font-medium mb-1">
                    {lynisResult.suggestionsCount} Suggestion{lynisResult.suggestionsCount === 1 ? '' : 's'}
                  </p>
                  <ul class="space-y-1 max-h-48 overflow-y-auto">
                    {#each lynisResult.suggestions as s}
                      <li class="text-xs text-muted-foreground">• {s}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Additional Hardening -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-3">
        <ClipboardCheck size={18} class="text-muted-foreground" />
        <p class="text-[13px] font-medium">Additional Hardening</p>
      </div>
      <div class="divide-y divide-border border-t border-border">
        <div class="flex items-center justify-between px-4 py-3 gap-2">
          <div>
            <p class="text-[13px]">Residual Packages</p>
            <p class="text-xs text-muted-foreground">
              {status.residualPackages > 0
                ? `${status.residualPackages} removed package${status.residualPackages === 1 ? '' : 's'} still have leftover config files`
                : 'None found'}
            </p>
          </div>
          {#if status.residualPackages > 0}
            <button
              onclick={purgeResidualPackages}
              disabled={purging}
              class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {#if purging}
                <RefreshCw size={12} class="animate-spin" />
                Purging…
              {:else}
                Purge
              {/if}
            </button>
          {:else}
            <CheckCircle2 size={16} class="text-status-ok shrink-0" />
          {/if}
        </div>

        <div class="flex items-center justify-between px-4 py-3 gap-2">
          <div>
            <p class="text-[13px]">Unused Network Protocols</p>
            <p class="text-xs text-muted-foreground">
              {status.protocolsBlacklisted ? 'dccp/sctp/rds/tipc blocked from loading' : 'dccp/sctp/rds/tipc can still load'}
            </p>
          </div>
          {#if !status.protocolsBlacklisted}
            <button
              onclick={blacklistProtocols}
              disabled={blacklisting}
              class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {#if blacklisting}
                <RefreshCw size={12} class="animate-spin" />
                Applying…
              {:else}
                Blacklist
              {/if}
            </button>
          {:else}
            <CheckCircle2 size={16} class="text-status-ok shrink-0" />
          {/if}
        </div>
      </div>
    </div>

  {/if}
  </div>

  <ConfirmDialog
    open={confirmSshStop}
    onOpenChange={(open) => { if (!open) confirmSshStop = false }}
    title="Stop the SSH server?"
    description="Remote sessions will be dropped and new connections refused until it is started again."
    busy={sshToggling}
    actions={[
      { label: 'Cancel', variant: 'secondary', onClick: () => { confirmSshStop = false } },
      { label: 'Stop SSH', variant: 'destructive', onClick: () => setSsh(false) },
    ]}
  />
</Page>
