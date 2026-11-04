<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, EmptyState, Dialog } from '$ui'
  import Alert from '$lib/Alert.svelte'
  import { toasts } from '$stores/toasts'
  import {
    Radar, RefreshCw, Unplug, MonitorSmartphone,
    Loader2, CheckCircle2, ShieldAlert, Wrench, Copy, XCircle
  } from 'lucide-svelte'

  type RwScore = {
    score: number
    openCriticals: number
    openHighs: number
    openVulnerabilities: number
    events24h: number
  }
  type RwDevice = {
    id: number; hostId?: string; hostname: string; os: string | null; platform: string | null
    agentVersion: string | null; lastSeenAt: string; health: string
  }
  type RwRemediation = {
    id: number; title: string; status: string; risk: string
    category: string; createdAt: string; deviceId: number | null
  }
  type RwRemediationDetail = {
    id: number; title: string; description: string; category: string; risk: string
    status: string; deviceId: number | null
    plan: { label: string; argv: string[] }[]
    rollbackPlan: { label: string; argv: string[] }[] | null
    createdAt: string
  }
  type LocalRunResult = {
    ran: boolean
    unmapped?: string[]
    steps?: { label: string; ok: boolean; detail?: string }[]
  }

  type RwStatus = {
    connected: boolean
    baseUrl?: string
    tokenProtected?: boolean
    thisHostname: string
    score?: RwScore
    devices?: RwDevice[]
    remediations?: RwRemediation[]
    error?: string
    enrolled?: boolean
    thisHostId?: string
    lastReportAt?: string | null
    lastReportError?: string | null
  }

  type Phase = 'loading' | 'connect' | 'pairing' | 'connected'

  let phase = $state<Phase>('loading')
  let status = $state<RwStatus | null>(null)
  let urlInput = $state('')
  let urlError = $state('')
  let connectBusy = $state(false)

  let pairCode = $state('')
  let pairVerifyUrl = $state('')
  let pairExpiresAt = $state(0)
  let pollTimer: ReturnType<typeof setInterval> | undefined

  let enrolling = $state(false)
  let enrollCode = $state('')
  let enrollExpiresAt = $state(0)
  let enrollError = $state('')
  let enrollPoll: ReturnType<typeof setInterval> | undefined

  const thisDevice = $derived(
    status?.devices?.find(d =>
      (status?.thisHostId && d.hostId === status.thisHostId) ||
      d.hostname === status?.thisHostname
    ) ?? null
  )
  // Another agent (the RootWatch desktop sensor) already reporting this
  // machine's device row — LCC enrolling too would just flap the report blob.
  const enrolledElsewhere = $derived(
    !!thisDevice && !status?.enrolled
  )
  const deviceName = $derived((id: number | null) =>
    status?.devices?.find(d => d.id === id)?.hostname ?? (id ? `device ${id}` : 'this host')
  )

  async function refresh() {
    try {
      status = await invoke<RwStatus>('rootwatch:status')
      phase = status.connected ? 'connected' : 'connect'
    } catch (e) {
      urlError = String(e)
      phase = 'connect'
    }
  }

  async function startPairing() {
    urlError = ''
    connectBusy = true
    try {
      const res = await invoke<{ code: string; verifyUrl: string; expiresAt: string }>(
        'rootwatch:pair-start', urlInput.trim()
      )
      pairCode = res.code
      pairVerifyUrl = res.verifyUrl
      pairExpiresAt = new Date(res.expiresAt).getTime()
      phase = 'pairing'
      pollTimer = setInterval(pollClaim, 3000)
    } catch (e) {
      urlError = String(e).replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
    } finally {
      connectBusy = false
    }
  }

  async function pollClaim() {
    if (pairExpiresAt && Date.now() > pairExpiresAt) {
      stopPolling()
      phase = 'connect'
      urlError = 'Pairing code expired — try connecting again'
      return
    }
    try {
      const res = await invoke<'pending' | 'approved'>('rootwatch:pair-claim')
      if (res === 'approved') {
        stopPolling()
        toasts.success('Connected to RootWatch', 'RootWatch')
        await refresh()
      }
    } catch (e) {
      stopPolling()
      phase = 'connect'
      urlError = String(e).replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
    }
  }

  function stopPolling() {
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  function stripIpc(e: unknown): string {
    return String(e).replace(/^Error invoking remote method '[^']+': Error:\s*/, '')
  }

  async function startEnroll() {
    enrollError = ''
    try {
      const res = await invoke<{ code: string; verifyUrl: string; expiresAt: string }>('rootwatch:enroll-start')
      enrollCode = res.code
      enrollExpiresAt = new Date(res.expiresAt).getTime()
      enrolling = true
      enrollPoll = setInterval(pollEnroll, 3000)
    } catch (e) {
      enrollError = stripIpc(e)
    }
  }

  async function pollEnroll() {
    if (enrollExpiresAt && Date.now() > enrollExpiresAt) {
      stopEnrollPoll()
      enrolling = false
      enrollError = 'Enrollment code expired — try again'
      return
    }
    try {
      const res = await invoke<'pending' | 'approved'>('rootwatch:enroll-claim')
      if (res === 'approved') {
        stopEnrollPoll()
        enrolling = false
        toasts.success('Device enrolled — reporting every 5 minutes', 'RootWatch')
        await refresh()
      }
    } catch (e) {
      stopEnrollPoll()
      enrolling = false
      enrollError = stripIpc(e)
    }
  }

  function stopEnrollPoll() {
    clearInterval(enrollPoll)
    enrollPoll = undefined
  }

  // ── Remediation fix dialog ──────────────────────────────────────────────
  let fixTarget = $state<RwRemediation | null>(null)
  let fixDetail = $state<RwRemediationDetail | null>(null)
  let fixLoading = $state(false)
  let fixBusy = $state(false)
  let fixError = $state('')
  let fixLocal = $state<LocalRunResult | null>(null)
  let fixRemote = $state<{ status: string } | null>(null)

  async function openFix(r: RwRemediation) {
    fixTarget = r
    fixDetail = null; fixLocal = null; fixRemote = null; fixError = ''
    fixLoading = true
    try {
      fixDetail = await invoke<RwRemediationDetail>('rootwatch:remediation', r.id)
    } catch (e) {
      fixError = stripIpc(e)
    } finally {
      fixLoading = false
    }
  }

  function closeFix() {
    fixTarget = null
    void refresh()
  }

  async function runLocal() {
    if (!fixTarget) return
    fixBusy = true; fixError = ''; fixLocal = null
    try {
      fixLocal = await invoke<LocalRunResult>('rootwatch:remediate', fixTarget.id, 'local')
    } catch (e) {
      fixError = stripIpc(e)
    } finally {
      fixBusy = false
    }
  }

  async function runRemote() {
    if (!fixTarget) return
    fixBusy = true; fixError = ''; fixRemote = null
    try {
      fixRemote = await invoke<{ status: string }>(
        'rootwatch:remediate', fixTarget.id, 'remote', fixTarget.risk !== 'safe'
      )
    } catch (e) {
      fixError = stripIpc(e)
    } finally {
      fixBusy = false
    }
  }

  function copyPlan() {
    if (!fixDetail) return
    const text = fixDetail.plan.map(s => `# ${s.label}\n${s.argv.join(' ')}`).join('\n')
    void invoke('clipboard:write', text)
    toasts.success('Plan copied to clipboard', 'RootWatch')
  }

  async function disconnect() {
    try {
      await invoke('rootwatch:disconnect')
      status = null
      phase = 'connect'
      toasts.success('Disconnected from RootWatch', 'RootWatch')
    } catch (e) {
      toasts.error(String(e), 'RootWatch')
    }
  }

  function scoreClass(score: number): string {
    if (score >= 80) return 'text-status-ok'
    if (score >= 50) return 'text-status-warn'
    return 'text-status-fail'
  }

  function riskClass(risk: string): string {
    if (risk === 'critical') return 'text-status-fail'
    if (risk === 'guarded') return 'text-status-warn'
    return 'text-status-ok'
  }

  function timeAgo(ts: string): string {
    const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000))
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  onMount(() => { void refresh() })
  onDestroy(() => { stopPolling(); stopEnrollPoll() })
</script>

<Page width="wide">
  {#snippet actions()}
    {#if phase === 'connected'}
      <Button variant="icon" size="sm" aria-label="Refresh" onclick={refresh}>
        <RefreshCw size={14} />
      </Button>
    {/if}
  {/snippet}

  <div class="space-y-4">
    {#if phase === 'loading'}
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-40 w-full" />

    {:else if phase === 'connect'}
      <Card class="max-w-lg space-y-4">
        <div class="flex items-center gap-3">
          <Radar size={22} class="text-primary shrink-0" />
          <div>
            <p class="text-[13px] font-medium">Connect to RootWatch</p>
            <p class="text-xs text-muted-foreground">
              Pair with your RootWatch instance to see security posture, findings, and fleet status here.
            </p>
          </div>
        </div>
        <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); void startPairing() }}>
          <input
            bind:value={urlInput}
            type="url"
            required
            placeholder="https://rootwatch.example.com or http://localhost:5000"
            class="flex-1 min-w-0 h-8 px-3 rounded-md border border-border bg-secondary/50 text-[13px] outline-none placeholder:text-muted-foreground/50"
            aria-label="RootWatch instance URL"
          />
          <Button variant="primary" size="sm" disabled={connectBusy || !urlInput.trim()}>
            {#if connectBusy}<Loader2 size={13} class="animate-spin" />{/if}
            Connect
          </Button>
        </form>
        {#if urlError}
          <Alert message={urlError} />
        {/if}
        <p class="text-[11px] text-muted-foreground">
          Connecting opens your browser to approve a read-scope API token — no password is stored in the app.
        </p>
      </Card>

    {:else if phase === 'pairing'}
      <Card class="max-w-lg space-y-4">
        <div class="flex items-center gap-3">
          <Loader2 size={18} class="animate-spin text-primary shrink-0" />
          <div>
            <p class="text-[13px] font-medium">Approve in your browser</p>
            <p class="text-xs text-muted-foreground">
              A RootWatch approval page should have opened. Approve the request to finish connecting.
            </p>
          </div>
        </div>
        <div class="rounded-md bg-secondary/60 px-4 py-3 text-center">
          <p class="text-[11px] text-muted-foreground uppercase tracking-wide">Pairing code</p>
          <p class="text-2xl font-mono font-semibold tracking-[0.2em] mt-1">{pairCode}</p>
        </div>
        <p class="text-[11px] text-muted-foreground break-all">
          If the page didn't open: <span class="font-mono">{pairVerifyUrl}</span>
        </p>
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onclick={() => { stopPolling(); phase = 'connect' }}>
            Cancel
          </Button>
        </div>
      </Card>

    {:else if status}
      {#if status.error}
        <Alert message={`Connected to ${status.baseUrl}, but status fetch failed: ${status.error}`} />
      {/if}
      {#if status.tokenProtected === false}
        <Alert variant="warn" message="safeStorage is unavailable on this system — the API token is stored unencrypted in the app data directory." />
      {/if}

      <!-- Posture summary -->
      <div class="grid grid-cols-4 gap-3">
        <Card padding="sm" class="text-center">
          <p class="text-[11px] text-muted-foreground uppercase tracking-wide">Score</p>
          <p class="text-3xl font-bold tabular-nums mt-1 {scoreClass(status.score?.score ?? 0)}">
            {status.score?.score ?? '—'}
          </p>
        </Card>
        <Card padding="sm" class="text-center">
          <p class="text-[11px] text-muted-foreground uppercase tracking-wide">Critical</p>
          <p class="text-3xl font-bold tabular-nums mt-1 {status.score?.openCriticals ? 'text-status-fail' : 'text-muted-foreground'}">
            {status.score?.openCriticals ?? '—'}
          </p>
        </Card>
        <Card padding="sm" class="text-center">
          <p class="text-[11px] text-muted-foreground uppercase tracking-wide">High</p>
          <p class="text-3xl font-bold tabular-nums mt-1 {status.score?.openHighs ? 'text-status-warn' : 'text-muted-foreground'}">
            {status.score?.openHighs ?? '—'}
          </p>
        </Card>
        <Card padding="sm" class="text-center">
          <p class="text-[11px] text-muted-foreground uppercase tracking-wide">Events 24h</p>
          <p class="text-3xl font-bold tabular-nums mt-1 text-foreground">
            {status.score?.events24h ?? '—'}
          </p>
        </Card>
      </div>

      <!-- This device -->
      <Card class="space-y-3">
        <div class="flex items-center gap-3">
          <MonitorSmartphone size={20} class={thisDevice || status.enrolled ? 'text-status-ok' : 'text-muted-foreground'} />
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-medium">This device — {status.thisHostname}</p>
            {#if enrolling}
              <p class="text-xs text-muted-foreground">
                Approve the enrollment in your browser to start reporting.
              </p>
            {:else if status.enrolled}
              <p class="text-xs text-muted-foreground">
                Enrolled · reporting via lcc agent every 5 min
                {#if status.lastReportAt}· last report {timeAgo(status.lastReportAt)}{/if}
              </p>
            {:else if thisDevice}
              <p class="text-xs text-muted-foreground">
                Enrolled{thisDevice.agentVersion ? ` via ${thisDevice.agentVersion}` : ''} · {thisDevice.health} · last report {timeAgo(thisDevice.lastSeenAt)}
              </p>
            {:else}
              <p class="text-xs text-muted-foreground">
                Not enrolled — enroll this machine to report posture to the fleet.
              </p>
            {/if}
          </div>
          {#if !status.enrolled && !enrolling && !enrolledElsewhere}
            <Button variant="secondary" size="sm" onclick={startEnroll}>
              Enroll device
            </Button>
          {/if}
        </div>

        {#if enrolling}
          <div class="flex items-center gap-3 rounded-md bg-secondary/60 px-4 py-3">
            <Loader2 size={16} class="animate-spin text-primary shrink-0" />
            <div class="flex-1">
              <p class="text-[11px] text-muted-foreground uppercase tracking-wide">Enrollment code</p>
              <p class="text-xl font-mono font-semibold tracking-[0.2em]">{enrollCode}</p>
            </div>
            <Button variant="ghost" size="sm" onclick={() => { stopEnrollPoll(); enrolling = false }}>
              Cancel
            </Button>
          </div>
        {/if}
        {#if status.lastReportError && status.enrolled}
          <Alert message={`Last report failed: ${status.lastReportError}`} />
        {/if}
        {#if enrollError}
          <Alert message={enrollError} />
        {/if}
      </Card>

      <!-- Open remediations -->
      {#if status.remediations && status.remediations.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
            <ShieldAlert size={16} class="text-status-warn" />
            <span class="text-[13px] font-medium">Open remediations ({status.remediations.length})</span>
          </div>
          <div class="divide-y divide-border/60">
            {#each status.remediations as r (r.id)}
              <div class="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span class="flex-1 min-w-0 truncate font-medium">{r.title}</span>
                <span class="text-muted-foreground">{deviceName(r.deviceId)}</span>
                <span class="px-2 py-0.5 rounded-md bg-secondary capitalize {riskClass(r.risk)}">{r.risk}</span>
                <span class="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground capitalize">{r.status}</span>
                <span class="text-muted-foreground/60 whitespace-nowrap">{timeAgo(r.createdAt)}</span>
                <Button variant="secondary" size="sm" onclick={() => openFix(r)}>
                  <Wrench size={12} class="mr-1" /> Fix
                </Button>
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- Fleet -->
      {#if status.devices && status.devices.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <span class="text-[13px] font-medium">Fleet ({status.devices.length})</span>
          </div>
          <div class="divide-y divide-border/60">
            {#each status.devices as d (d.id)}
              <div class="flex items-center gap-3 px-4 py-2.5 text-xs">
                <CheckCircle2 size={13} class={d.health === 'online' ? 'text-status-ok' : 'text-muted-foreground'} />
                <span class="font-medium w-40 truncate">{d.hostname}</span>
                <span class="text-muted-foreground flex-1 truncate">{d.os ?? d.platform ?? ''}</span>
                <span class="text-muted-foreground capitalize">{d.health}</span>
                <span class="text-muted-foreground/60 whitespace-nowrap">{timeAgo(d.lastSeenAt)}</span>
              </div>
            {/each}
          </div>
        </Card>
      {:else if !status.error}
        <EmptyState
          icon={MonitorSmartphone}
          title="No devices enrolled"
          message="Enroll machines with the RootWatch agent or desktop app to see them here."
        />
      {/if}

      <!-- Connection footer -->
      <div class="flex items-center justify-between text-[11px] text-muted-foreground">
        <span class="truncate">Instance: <span class="font-mono">{status.baseUrl}</span></span>
        <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={disconnect}>
          <Unplug size={13} class="mr-1.5" />
          Disconnect
        </Button>
      </div>
    {/if}
  </div>

  <Dialog
    open={fixTarget !== null}
    onOpenChange={(open) => { if (!open) closeFix() }}
    title={fixTarget?.title ?? ''}
    class="max-w-xl"
  >
    <div class="space-y-4 max-h-[60vh] overflow-y-auto">
      {#if fixLoading}
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-24 w-full" />
      {:else if fixDetail}
        <div class="flex items-center gap-2 text-xs">
          <span class="px-2 py-0.5 rounded-md bg-secondary capitalize {riskClass(fixDetail.risk)}">{fixDetail.risk}</span>
          <span class="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground capitalize">{fixDetail.category}</span>
          <span class="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground capitalize">{fixDetail.status}</span>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{fixDetail.description}</p>

        {#if fixDetail.plan?.length}
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Plan</p>
            <ol class="space-y-1.5">
              {#each fixDetail.plan as step, i (i)}
                <li class="text-xs">
                  <span class="font-medium">{i + 1}. {step.label}</span>
                  <p class="font-mono text-[11px] text-muted-foreground break-all">{step.argv.join(' ')}</p>
                </li>
              {/each}
            </ol>
          </div>
        {/if}

        {#if fixTarget?.risk !== 'safe'}
          <Alert variant="warn" message="This change is risk-classified — it can affect connectivity or services. Review the plan before running it." />
        {/if}

        {#if fixError}
          <Alert message={fixError} />
        {/if}
        {#if fixLocal?.unmapped}
          <Alert variant="warn" message={`Can't run locally — these steps have no safe local equivalent: ${fixLocal.unmapped.join('; ')}. Execute via RootWatch instead.`} />
        {/if}
        {#if fixLocal?.steps}
          <div class="space-y-1">
            {#each fixLocal.steps as s, i (i)}
              <div class="flex items-center gap-2 text-xs">
                {#if s.ok}
                  <CheckCircle2 size={13} class="text-status-ok shrink-0" />
                  <span>{s.label}</span>
                {:else}
                  <XCircle size={13} class="text-status-fail shrink-0" />
                  <span>{s.label} — <span class="text-status-fail">{s.detail}</span></span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if fixRemote}
          <Alert message={`RootWatch execute returned: ${fixRemote.status}`} />
        {/if}
      {:else}
        <Alert message={fixError || 'Failed to load remediation'} />
      {/if}
    </div>
    <div class="flex items-center justify-between pt-3">
      <Button variant="ghost" size="sm" onclick={copyPlan} disabled={!fixDetail}>
        <Copy size={13} class="mr-1.5" /> Copy plan
      </Button>
      <div class="flex gap-2">
        <Button variant="secondary" size="sm" onclick={runLocal} disabled={fixBusy || !fixDetail}>
          {#if fixBusy}<Loader2 size={12} class="animate-spin mr-1" />{/if}
          Run on this machine
        </Button>
        <Button variant="secondary" size="sm" onclick={runRemote} disabled={fixBusy || !fixDetail}>
          Execute via RootWatch
        </Button>
      </div>
    </div>
  </Dialog>
</Page>
