<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import {
    Shield, ShieldAlert, ShieldCheck, ShieldOff,
    Lock, Unlock, Eye, EyeOff, RefreshCw,
    Terminal, HardDrive, Globe, Users, AlertTriangle,
    CheckCircle2, XCircle, ChevronDown, ChevronUp,
    Power, Loader2
  } from 'lucide-svelte'

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

  type SecurityStatus = {
    firewall: FirewallStatus | null
    ports: PortInfo[]
    failedLogins: LoginAttempt[]
    ssh: SshStatus | null
    encryption: EncryptionStatus | null
    securityUpdates: number
    kernelUpdates: boolean
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
    logins: false
  })

  let firewallToggling = $state(false)
  let sshToggling = $state(false)

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
  async function toggleFirewall() {
    if (!status?.firewall) return
    firewallToggling = true
    try {
      const action = status.firewall.active ? 'disable' : 'enable'
      await invoke('firewall:set', action)
      await load()
    } catch (e) {
      error = String(e)
    } finally {
      firewallToggling = false
    }
  }

  async function toggleSsh() {
    if (!status?.ssh) return
    sshToggling = true
    try {
      const action = status.ssh.running ? 'stop' : 'start'
      await invoke('ssh:set', action)
      await load()
    } catch (e) {
      error = String(e)
    } finally {
      sshToggling = false
    }
  }

  onMount(() => load())

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleSection(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] }
  }
</script>

<div class="max-w-2xl space-y-3">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Shield size={18} class="text-primary" />
      <span class="text-sm font-medium">Security Overview</span>
    </div>
    <button
      onclick={() => load(true)}
      disabled={refreshing}
      class="text-muted-foreground hover:text-foreground transition-colors"
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </button>
  </div>

  {#if error}
    <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
      <p class="text-sm text-destructive flex items-center gap-2">
        <AlertTriangle size={14} />
        {error}
      </p>
    </div>
  {/if}

  {#if loading}
    <div class="h-64 flex items-center justify-center text-muted-foreground">
      <Loader2 size={20} class="animate-spin mr-2" />
      Scanning security status…
    </div>
  {:else if status}

    <!-- Firewall -->
    <div class="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onclick={() => toggleSection('firewall')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if status.firewall?.active}
            <ShieldCheck size={18} class="text-green-400" />
          {:else if status.firewall?.installed}
            <ShieldAlert size={18} class="text-yellow-400" />
          {:else}
            <ShieldOff size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-sm font-medium">Firewall</p>
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
        </div>
        <div class="flex items-center gap-2">
          {#if status.firewall?.installed}
            <button
              onclick={(e) => { e.stopPropagation(); toggleFirewall() }}
              disabled={firewallToggling}
              class="relative w-11 h-6 rounded-full transition-colors disabled:opacity-50
                     {status.firewall.active ? 'bg-green-400' : 'bg-secondary border border-border'}"
            >
              <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                           {status.firewall.active ? 'translate-x-5' : ''}"></span>
            </button>
          {/if}
          {#if expanded.firewall}
            <ChevronUp size={16} class="text-muted-foreground" />
          {:else}
            <ChevronDown size={16} class="text-muted-foreground" />
          {/if}
        </div>
      </button>

      {#if expanded.firewall && status.firewall}
        <div class="px-4 pb-4 pt-1 space-y-2 border-t border-border">
          <div class="grid grid-cols-2 gap-3 text-sm pt-2">
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
            <p class="text-sm font-medium">Open Ports</p>
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
            <div class="px-4 py-6 text-center text-sm text-muted-foreground">
              No listening ports found
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.ports as port}
                <div class="flex items-center justify-between px-4 py-2.5 text-sm">
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
      <button
        onclick={() => toggleSection('ssh')}
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if status.ssh?.running}
            <Terminal size={18} class="text-yellow-400" />
          {:else}
            <Terminal size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-sm font-medium">SSH Server</p>
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
        </div>
        <div class="flex items-center gap-2">
          {#if status.ssh?.installed}
            <button
              onclick={(e) => { e.stopPropagation(); toggleSsh() }}
              disabled={sshToggling}
              class="relative w-11 h-6 rounded-full transition-colors disabled:opacity-50
                     {status.ssh.running ? 'bg-yellow-400' : 'bg-secondary border border-border'}"
            >
              <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                           {status.ssh.running ? 'translate-x-5' : ''}"></span>
            </button>
          {/if}
          {#if expanded.ssh}
            <ChevronUp size={16} class="text-muted-foreground" />
          {:else}
            <ChevronDown size={16} class="text-muted-foreground" />
          {/if}
        </div>
      </button>

      {#if expanded.ssh && status.ssh?.installed}
        <div class="px-4 pb-4 pt-1 space-y-2 border-t border-border">
          <div class="grid grid-cols-2 gap-3 text-sm pt-2">
            <div class="rounded-lg bg-secondary/50 p-2.5">
              <p class="text-xs text-muted-foreground mb-1">Password Auth</p>
              <div class="flex items-center gap-1.5">
                {#if status.ssh.passwordAuth}
                  <XCircle size={14} class="text-yellow-400" />
                  <span>Enabled</span>
                {:else}
                  <CheckCircle2 size={14} class="text-green-400" />
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
                  <CheckCircle2 size={14} class="text-green-400" />
                  <span>Disabled</span>
                {/if}
              </div>
            </div>
          </div>
          {#if status.ssh.passwordAuth || status.ssh.rootLogin}
            <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5">
              <p class="text-xs text-yellow-400 flex items-center gap-1.5">
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
            <Lock size={18} class="text-green-400" />
          {:else}
            <Unlock size={18} class="text-muted-foreground" />
          {/if}
          <div class="text-left">
            <p class="text-sm font-medium">Disk Encryption</p>
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
            <div class="px-4 py-4 text-center text-sm text-muted-foreground">
              No LUKS-encrypted devices detected
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.encryption.devices as dev}
                <div class="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span class="font-mono">{dev.name}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">{dev.type}</span>
                    {#if dev.encrypted}
                      <Lock size={12} class="text-green-400" />
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
            <AlertTriangle size={18} class="text-yellow-400" />
          {:else}
            <CheckCircle2 size={18} class="text-green-400" />
          {/if}
          <div class="text-left">
            <p class="text-sm font-medium">Security Updates</p>
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
          <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-3">
            <p class="text-sm text-yellow-400 flex items-center gap-2">
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
            <p class="text-sm font-medium">Failed Logins</p>
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
            <div class="px-4 py-4 text-center text-sm text-muted-foreground">
              No failed login attempts in the last 7 days
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each status.failedLogins as login}
                <div class="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span class="font-mono">{login.user}</span>
                  <div class="text-right">
                    <p class="text-xs text-muted-foreground">{login.count} attempts</p>
                    <p class="text-[10px] text-muted-foreground/60">Latest: {login.latest}</p>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

  {/if}
</div>
