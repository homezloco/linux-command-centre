<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke, tempColor } from '$lib/utils'
  import { Page, Card, Skeleton, Button } from '$ui'
  import { badges } from '$stores/badges'
  import { setActive } from '$stores/nav'
  import Alert from '$lib/Alert.svelte'
  import {
    RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info,
    GitBranch, Package, Cpu, Plus, ExternalLink, X,
    MemoryStick, Thermometer, Network, ArrowDown, ArrowUp,
  } from 'lucide-svelte'

  let { visible = true }: { visible?: boolean } = $props()

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
  type SystemStatus = {
    cpu: { usage: number }
    memory: { total: number; used: number }
  }
  type ThermalSnapshot = {
    temps: { label: string; celsius: number }[]
  }
  type NetInterface = {
    name: string; state: string; ipv4: string | null; isDefault: boolean
  }
  type NetworkStatus = { interfaces: NetInterface[] }
  type SpeedMap = Record<string, { rxBps: number; txBps: number }>

  const HISTORY_MAX = 60
  const SPARK_W = 120
  const SPARK_H = 32
  const vitalHover = 'h-full transition-colors hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'
  const vitalLink = 'block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  let info = $state<DeviceInfo | null>(null)
  let checks = $state<HwCheck[]>([])
  let issues = $state<IssuesResult | null>(null)
  let loading = $state(true)
  let vitalsLoading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let issuesLoading = $state(false)
  let issuesError = $state('')
  let actionRunning = $state<string | null>(null)

  let sys = $state<SystemStatus | null>(null)
  let thermal = $state<ThermalSnapshot | null>(null)
  let netStatus = $state<NetworkStatus | null>(null)
  let speeds = $state<SpeedMap>({})
  let cpuHistory = $state<number[]>([])

  let showAddForm = $state(false)
  let addUrl = $state('')
  let addLabel = $state('')
  let addError = $state('')
  let adding = $state(false)

  let sysInterval: ReturnType<typeof setInterval> | undefined
  let thermalInterval: ReturnType<typeof setInterval> | undefined
  let speedInterval: ReturnType<typeof setInterval> | undefined

  const hottest = $derived.by(() => {
    const temps = thermal?.temps ?? []
    if (!temps.length) return null
    return temps.reduce((a, b) => (a.celsius >= b.celsius ? a : b))
  })
  const defaultIface = $derived(
    netStatus?.interfaces.find((i) => i.isDefault)
      ?? netStatus?.interfaces.find((i) => i.state === 'up' && i.name !== 'lo')
      ?? netStatus?.interfaces[0]
      ?? null,
  )
  const ifaceSpeed = $derived(defaultIface ? speeds[defaultIface.name] : undefined)
  const memPct = $derived(
    sys && sys.memory.total > 0 ? Math.round(sys.memory.used / sys.memory.total * 100) : null,
  )

  async function loadDevice() {
    error = ''
    try {
      const [i, c] = await Promise.all([
        invoke<DeviceInfo>('device:info'),
        invoke<HwCheck[]>('device:hardwareStatus'),
      ])
      info = i
      checks = c
    } catch (e) { error = String(e) }
  }

  async function loadIssues(force = false) {
    issuesLoading = true
    issuesError = ''
    try {
      issues = await invoke<IssuesResult>('device:knownIssues', force)
    } catch (e) { issuesError = String(e) }
    finally { issuesLoading = false }
  }

  function pushCpu(usage: number) {
    cpuHistory = [...cpuHistory, usage].slice(-HISTORY_MAX)
  }

  async function pollSystem() {
    try {
      const s = await invoke<SystemStatus>('system:status')
      sys = s
      pushCpu(s.cpu.usage)
    } catch { /* keep last */ }
  }

  async function pollThermal() {
    try { thermal = await invoke<ThermalSnapshot>('thermal:snapshot') }
    catch { /* keep last */ }
  }

  async function pollSpeed() {
    try { speeds = await invoke<SpeedMap>('network:speed') }
    catch { /* non-critical */ }
  }

  async function loadNetStatus() {
    try { netStatus = await invoke<NetworkStatus>('network:status') }
    catch { /* keep last */ }
  }

  async function loadVitals() {
    await Promise.all([pollSystem(), pollThermal(), loadNetStatus(), pollSpeed()])
  }

  async function refresh() {
    refreshing = true
    try {
      await Promise.all([loadDevice(), loadIssues(true), loadVitals()])
    } finally { refreshing = false }
  }

  async function runAction(action: string, id: string) {
    actionRunning = id
    try {
      if (action === 'touchpad-rebind') {
        await invoke('touchpad:rebind')
        await loadDevice()
      } else if (action === 'camera-rebuild') {
        await invoke('camera:rebuild')
        await loadDevice()
      } else if (action === 'camera-load') {
        await invoke('camera:loadModules')
        await loadDevice()
      } else if (action === 'rtc-set-utc') {
        await invoke('device:setRtcUtc')
        await loadDevice()
      }
    } catch (e) { error = String(e) }
    finally { actionRunning = null }
  }

  function parseIssueUrl(url: string): string | null {
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

  function fmtSpeed(bps: number): string {
    if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' GB/s'
    if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' MB/s'
    if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' KB/s'
    return bps + ' B/s'
  }

  function sparkColor(pct: number): string {
    if (pct >= 90) return 'hsl(var(--status-fail))'
    if (pct >= 70) return 'hsl(var(--status-warn))'
    return 'hsl(var(--primary))'
  }

  function sparkPoints(data: number[]): string {
    if (data.length < 2) return ''
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W
      const y = SPARK_H - (Math.max(0, Math.min(100, v)) / 100) * SPARK_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  function sparkArea(data: number[]): string {
    if (data.length < 2) return ''
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W
      const y = SPARK_H - (Math.max(0, Math.min(100, v)) / 100) * SPARK_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return `M0,${SPARK_H} L${pts.join(' L')} L${SPARK_W},${SPARK_H} Z`
  }

  function onVitalClick(e: MouseEvent, id: string) {
    e.preventDefault()
    setActive(id)
  }

  function checkIconClass(state: HwCheck['state']): string {
    if (state === 'ok') return 'text-status-ok'
    if (state === 'warn') return 'text-status-warn'
    if (state === 'fail') return 'text-status-fail'
    return 'text-primary'
  }

  onMount(() => {
    void loadDevice().finally(() => { loading = false })
    void loadVitals().finally(() => { vitalsLoading = false })
    void loadIssues()
  })

  $effect(() => {
    if (!visible) {
      clearInterval(sysInterval); sysInterval = undefined
      clearInterval(thermalInterval); thermalInterval = undefined
      clearInterval(speedInterval); speedInterval = undefined
      return
    }
    if (!sysInterval) sysInterval = setInterval(() => { void pollSystem() }, 5000)
    if (!thermalInterval) thermalInterval = setInterval(() => { void pollThermal() }, 5000)
    if (!speedInterval) speedInterval = setInterval(() => { void pollSpeed() }, 1000)
  })
  onDestroy(() => {
    clearInterval(sysInterval)
    clearInterval(thermalInterval)
    clearInterval(speedInterval)
  })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh device status"
      disabled={refreshing}
      onclick={() => refresh()}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-5">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if !info}
      {#if loading}
        <Skeleton class="h-24 w-full" />
      {/if}
    {:else}
      <Card class="p-5">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold
                      {info.isHuawei ? 'bg-red-500/10 text-red-400' : info.isMsi ? 'bg-blue-500/10 text-blue-400' : 'bg-secondary text-muted-foreground'}">
            {info.vendor.slice(0, 2).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0 space-y-1">
            <p class="text-[13px] font-semibold leading-tight truncate">{info.model}{info.version && info.version !== info.model ? ` · ${info.version}` : ''}</p>
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
                <span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">Desktop</span>
              {/if}
              {#if info.isHuawei}
                <span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">Huawei</span>
              {:else if info.isMsi}
                <span class="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">MSI</span>
              {/if}
            </div>
          </div>
        </div>
      </Card>
    {/if}

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {#if vitalsLoading}
        {#each [0, 1, 2, 3, 4] as i (i)}
          <Skeleton class="h-[5.5rem] w-full {i === 4 ? 'col-span-2 lg:col-span-1' : ''}" />
        {/each}
      {:else}
        <a href="#system" class={vitalLink} onclick={(e) => onVitalClick(e, 'system')}>
          <Card class={vitalHover}>
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Cpu size={12} /> CPU
            </div>
            <p class="text-xl font-semibold tabular-nums mt-1">{sys ? `${sys.cpu.usage}%` : '—'}</p>
            {#if cpuHistory.length >= 2}
              <svg
                viewBox="0 0 {SPARK_W} {SPARK_H}"
                preserveAspectRatio="none"
                class="mt-2 h-8 w-full"
                aria-hidden="true"
              >
                <path d={sparkArea(cpuHistory)} fill={sparkColor(sys?.cpu.usage ?? 0)} opacity="0.15" />
                <polyline
                  points={sparkPoints(cpuHistory)}
                  fill="none"
                  stroke={sparkColor(sys?.cpu.usage ?? 0)}
                  stroke-width="1.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
              </svg>
            {/if}
          </Card>
        </a>

        <a href="#system" class={vitalLink} onclick={(e) => onVitalClick(e, 'system')}>
          <Card class={vitalHover}>
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MemoryStick size={12} /> Memory
            </div>
            <p class="text-xl font-semibold tabular-nums mt-1">{memPct != null ? `${memPct}%` : '—'}</p>
          </Card>
        </a>

        <a href="#thermal" class={vitalLink} onclick={(e) => onVitalClick(e, 'thermal')}>
          <Card class={vitalHover}>
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Thermometer size={12} /> Temp
            </div>
            {#if hottest}
              <p class="text-xl font-semibold tabular-nums mt-1 {tempColor(hottest.celsius)}">
                {hottest.celsius.toFixed(0)}°C
              </p>
              <p class="text-[11px] text-muted-foreground truncate mt-0.5">{hottest.label}</p>
            {:else}
              <p class="text-xl font-semibold mt-1">—</p>
            {/if}
          </Card>
        </a>

        <a href="#network" class={vitalLink} onclick={(e) => onVitalClick(e, 'network')}>
          <Card class={vitalHover}>
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Network size={12} /> {defaultIface?.name ?? 'Net'}
            </div>
            {#if defaultIface && ifaceSpeed}
              <div class="mt-1 space-y-0.5 text-[13px] font-medium tabular-nums">
                <p class="flex items-center gap-1 text-status-ok">
                  <ArrowDown size={12} /> {fmtSpeed(ifaceSpeed.rxBps)}
                </p>
                <p class="flex items-center gap-1 text-primary">
                  <ArrowUp size={12} /> {fmtSpeed(ifaceSpeed.txBps)}
                </p>
              </div>
            {:else if defaultIface}
              <p class="text-xl font-semibold mt-1">—</p>
              {#if defaultIface.ipv4}
                <p class="text-[11px] text-muted-foreground truncate mt-0.5">{defaultIface.ipv4}</p>
              {/if}
            {:else}
              <p class="text-xl font-semibold mt-1">—</p>
            {/if}
          </Card>
        </a>

        <a href="#updates" class="{vitalLink} col-span-2 lg:col-span-1" onclick={(e) => onVitalClick(e, 'updates')}>
          <Card class={vitalHover}>
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw size={12} /> Updates
            </div>
            <p class="text-xl font-semibold tabular-nums mt-1">{$badges.pendingUpdates}</p>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              {$badges.pendingUpdates === 0
                ? 'up to date'
                : $badges.pendingUpdates === 1
                  ? 'package available'
                  : 'packages available'}
            </p>
          </Card>
        </a>
      {/if}
    </div>

    {#if loading}
      <div class="space-y-2">
        <Skeleton class="h-3 w-36" />
        <Card padding="none">
          {#each [0, 1, 2, 3] as i (i)}
            <div class="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-0">
              <Skeleton class="size-3.5 rounded-full shrink-0" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-3 w-40" />
                <Skeleton class="h-2.5 w-64 max-w-full" />
              </div>
            </div>
          {/each}
        </Card>
      </div>
    {:else if checks.length > 0}
      <div class="space-y-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">Hardware Status</p>
        <Card padding="none" class="divide-y divide-border/60">
          {#each checks as check (check.id)}
            <div class="flex items-center gap-3 px-4 py-2.5">
              <div class="shrink-0">
                {#if check.state === 'ok'}
                  <CheckCircle2 size={14} class={checkIconClass(check.state)} />
                {:else if check.state === 'warn'}
                  <AlertTriangle size={14} class={checkIconClass(check.state)} />
                {:else if check.state === 'fail'}
                  <XCircle size={14} class={checkIconClass(check.state)} />
                {:else}
                  <Info size={14} class={checkIconClass(check.state)} />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium font-mono leading-tight">{check.label}</p>
                <p class="text-[11px] text-muted-foreground leading-snug mt-0.5">{check.detail}</p>
              </div>
              {#if check.action}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionRunning === check.id}
                  onclick={() => runAction(check.action!, check.id)}
                >
                  {actionRunning === check.id ? '…' : 'Fix'}
                </Button>
              {/if}
            </div>
          {/each}
        </Card>
      </div>
    {/if}

    <div class="space-y-2">
      <div class="flex items-center justify-between px-0.5">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Issue Tracker</p>
        <div class="flex items-center gap-2">
          {#if issues?.lastChecked}
            <span class="text-[11px] text-muted-foreground">checked {fmtDate(issues.lastChecked)}</span>
          {/if}
          <Button
            variant="icon"
            size="sm"
            aria-label="Refresh issues"
            disabled={issuesLoading}
            onclick={() => loadIssues(true)}
          >
            <RefreshCw size={12} class={issuesLoading ? 'animate-spin' : ''} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Add issue"
            onclick={() => { showAddForm = !showAddForm; addError = '' }}
          >
            <Plus size={11} />
            Add
          </Button>
        </div>
      </div>

      {#if issuesError}
        <Alert message={issuesError} />
      {/if}

      {#if showAddForm}
        <Card class="space-y-3">
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
            <Button variant="secondary" size="sm" onclick={() => { showAddForm = false; addError = '' }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={adding || !addUrl.trim()} onclick={addIssue}>
              {adding ? 'Adding…' : 'Track'}
            </Button>
          </div>
        </Card>
      {/if}

      {#if issuesLoading && !issues}
        <Card padding="none">
          {#each [0, 1] as i (i)}
            <div class="flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0">
              <Skeleton class="size-3.5 rounded-full shrink-0 mt-0.5" />
              <div class="flex-1 space-y-1.5">
                <Skeleton class="h-3 w-48" />
                <Skeleton class="h-2.5 w-72 max-w-full" />
              </div>
            </div>
          {/each}
        </Card>
      {:else if issues && issues.items.length > 0}
        <Card padding="none" class="divide-y divide-border/60">
          {#each issues.items as item (item.id)}
            {@const isUser = issues.userIssues.some((u) => u.ref === item.id)}
            <div class="flex items-start gap-3 px-4 py-3">
              <div class="shrink-0 mt-0.5">
                {#if item.type === 'github'}
                  <GitBranch size={13} class="text-muted-foreground" />
                {:else if item.type === 'package'}
                  <Package size={13} class="text-muted-foreground" />
                {:else if item.type === 'kernel'}
                  <Cpu size={13} class="text-muted-foreground" />
                {:else}
                  <Info size={13} class="text-muted-foreground" />
                {/if}
              </div>
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-xs font-medium leading-tight">{item.label}</p>
                  {#if item.state === 'ok' || item.state === 'closed'}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-status-ok/10 text-status-ok">
                      {item.state === 'closed' ? 'Closed' : 'OK'}
                    </span>
                  {:else if item.state === 'open'}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-orange-500/10 text-orange-400">Open</span>
                  {:else if item.state === 'warn'}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-status-warn/10 text-status-warn">Warn</span>
                  {:else if item.state === 'fail'}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-status-fail/10 text-status-fail">Fail</span>
                  {:else if item.state === 'error'}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-secondary text-muted-foreground">Error</span>
                  {:else}
                    <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-secondary text-muted-foreground">Unknown</span>
                  {/if}
                </div>
                <p class="text-[11px] text-muted-foreground leading-snug">{item.detail}</p>
                <div class="flex items-center gap-3 mt-1">
                  {#if item.url}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary transition-colors"
                    >
                      <ExternalLink size={10} />
                      {item.id}
                    </a>
                  {/if}
                  {#if item.updatedAt}
                    <span class="text-[11px] text-muted-foreground">updated {fmtUpdated(item.updatedAt)}</span>
                  {/if}
                  {#if item.comments !== undefined}
                    <span class="text-[11px] text-muted-foreground">{item.comments} comments</span>
                  {/if}
                </div>
              </div>
              {#if isUser}
                <button
                  type="button"
                  onclick={() => removeIssue(item.id)}
                  aria-label="Remove {item.label}"
                  class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X size={12} />
                </button>
              {/if}
            </div>
          {/each}
        </Card>
      {:else if issues}
        <Card class="p-6 text-center space-y-1">
          <p class="text-[13px] text-muted-foreground">No issues tracked</p>
          <p class="text-xs text-muted-foreground">Add a GitHub issue URL to monitor its status</p>
        </Card>
      {/if}
    </div>
  </div>
</Page>
