import { app, net, safeStorage, shell } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { existsSync, statfsSync } from 'fs'
import { join } from 'path'
import { hostname, release } from 'os'
import { createHash, randomUUID } from 'crypto'
import { run } from './shell'
import { readOps, writeLog } from './log'
import { privilegedOp, privilegedOpStreaming } from './privilege'

// RootWatch integration (phase R1): pair this app with a RootWatch instance
// via the browser cli-auth flow (the same one `rootwatch login` uses), keep
// the claimed rw_ token in safeStorage, and pull read-scope posture data.
// Device enrollment and action execution are deliberately later phases —
// this surface only ever needs `read` scope.

type RwConfig = {
  baseUrl: string
  tokenEnc?: string // base64 safeStorage ciphertext — preferred
  token?: string    // plaintext fallback when safeStorage is unavailable
  tokenProtected: boolean
  connectedAt: string
  // The write-scope token claimed from device enrollment — separate from the
  // read token above, same separation the RootWatch desktop keeps between
  // its connection token and deviceToken.
  deviceTokenEnc?: string
  deviceToken?: string
  deviceEnrolledAt?: string
}

export type RwStatus = {
  connected: boolean
  baseUrl?: string
  tokenProtected?: boolean
  thisHostname: string
  score?: {
    score: number
    openCriticals: number
    openHighs: number
    openVulnerabilities: number
    events24h: number
  }
  devices?: {
    id: number
    hostId: string
    hostname: string
    os: string | null
    platform: string | null
    agentVersion: string | null
    lastSeenAt: string
    health: string
  }[]
  remediations?: {
    id: number
    title: string
    status: string
    risk: string
    category: string
    createdAt: string
    deviceId: number | null
  }[]
  error?: string
  enrolled?: boolean
  thisHostId?: string
  lastReportAt?: string | null
  lastReportError?: string | null
}

const configPath = () => join(app.getPath('userData'), 'rootwatch.json')

async function loadConfig(): Promise<RwConfig | null> {
  try {
    const c = JSON.parse(await readFile(configPath(), 'utf8')) as RwConfig
    return c.baseUrl ? c : null
  } catch {
    return null
  }
}

async function saveConfig(c: RwConfig | null): Promise<void> {
  if (!c) {
    await writeFile(configPath(), '{}')
    return
  }
  await writeFile(configPath(), JSON.stringify(c, null, 2))
}

function decryptField(enc: string): string | null {
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

async function getToken(c: RwConfig): Promise<string | null> {
  if (c.tokenEnc) return decryptField(c.tokenEnc)
  return c.token ?? null
}

async function getDeviceToken(c: RwConfig): Promise<string | null> {
  if (c.deviceTokenEnc) return decryptField(c.deviceTokenEnc)
  return c.deviceToken ?? null
}

function sealToken(token: string): { enc?: string; plain?: string } {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: safeStorage.encryptString(token).toString('base64') }
  }
  return { plain: token }
}

type RwRequestOpts = { method?: string; body?: unknown; token?: string }

async function rwFetch(baseUrl: string, path: string, opts: RwRequestOpts = {}): Promise<unknown> {
  const res = await net.fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000)
  })
  const json = (await res.json().catch(() => null)) as
    | { data?: unknown; status?: string; token?: string; error?: { code?: string; message?: string } }
    | null
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  }
  return json
}

async function rwApi<T>(baseUrl: string, path: string, token: string): Promise<T> {
  const json = (await rwFetch(baseUrl, path, { token })) as { data?: T }
  return json?.data as T
}

// ── Pairing ─────────────────────────────────────────────────────────────────

let pendingPair: { baseUrl: string; code: string; secret: string; expiresAt: string } | null = null

export async function rwPairStart(rawBaseUrl: string): Promise<{ code: string; verifyUrl: string; expiresAt: string }> {
  let baseUrl: string
  try {
    const u = new URL(rawBaseUrl.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad scheme')
    baseUrl = u.origin
  } catch {
    throw new Error('Enter a valid instance URL, e.g. https://rootwatch.example.com')
  }

  const json = (await rwFetch(baseUrl, '/api/v1/cli-auth/start', {
    method: 'POST',
    body: { label: `linux-command-centre (${hostname()})` }
  })) as { code: string; secret: string; verifyUrl: string; expiresAt: string }

  pendingPair = { baseUrl, code: json.code, secret: json.secret, expiresAt: json.expiresAt }

  // Open the approval page for the user — the code is shown in-app as a
  // fallback for manual entry.
  void shell.openExternal(json.verifyUrl)
  return { code: json.code, verifyUrl: json.verifyUrl, expiresAt: json.expiresAt }
}

export async function rwPairClaim(): Promise<'pending' | 'approved'> {
  if (!pendingPair) throw new Error('No pairing session — start again')
  const { baseUrl, code, secret, expiresAt } = pendingPair
  if (Date.now() > new Date(expiresAt).getTime()) {
    pendingPair = null
    throw new Error('Pairing code expired — start again')
  }
  try {
    const json = (await rwFetch(baseUrl, '/api/v1/cli-auth/claim', {
      method: 'POST',
      body: { code, secret }
    })) as { status: string; token: string }
    if (json.status === 'approved' && json.token) {
      const tokenProtected = safeStorage.isEncryptionAvailable()
      const config: RwConfig = {
        baseUrl,
        tokenProtected,
        connectedAt: new Date().toISOString()
      }
      if (tokenProtected) {
        config.tokenEnc = safeStorage.encryptString(json.token).toString('base64')
      } else {
        config.token = json.token
      }
      await saveConfig(config)
      pendingPair = null
      return 'approved'
    }
    return 'pending'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Claim returns 4xx with AUTH_PENDING while the user hasn't approved yet —
    // that's an expected state, not a failure.
    if (/pending/i.test(msg)) return 'pending'
    pendingPair = null
    throw e
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

export async function rwStatus(): Promise<RwStatus> {
  const config = await loadConfig()
  const base = { thisHostname: hostname(), thisHostId: await deviceHostId() }
  if (!config) return { connected: false, ...base }
  const enrolled = !!(config.deviceTokenEnc || config.deviceToken)
  const reportState = { enrolled, lastReportAt, lastReportError }
  const token = await getToken(config)
  if (!token) {
    return { connected: true, baseUrl: config.baseUrl, tokenProtected: config.tokenProtected, error: 'Stored token could not be decrypted', ...reportState, ...base }
  }

  try {
    const [score, devices, remediations] = await Promise.all([
      rwApi<RwStatus['score']>(config.baseUrl, '/api/v1/score', token),
      rwApi<RwStatus['devices']>(config.baseUrl, '/api/v1/devices', token),
      rwApi<RwStatus['remediations']>(config.baseUrl, '/api/v1/remediations', token)
    ])
    const open = (remediations ?? [])
      .filter((r) => ['proposed', 'approved', 'executing'].includes(r.status))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 20)
    return {
      connected: true,
      baseUrl: config.baseUrl,
      tokenProtected: config.tokenProtected,
      score,
      devices: devices ?? [],
      remediations: open,
      ...reportState,
      ...base
    }
  } catch (e) {
    return {
      connected: true,
      baseUrl: config.baseUrl,
      tokenProtected: config.tokenProtected,
      error: e instanceof Error ? e.message : String(e),
      ...reportState,
      ...base
    }
  }
}

export async function rwDisconnect(): Promise<void> {
  pendingPair = null
  pendingEnroll = null
  stopReporter()
  await saveConfig(null)
}

// ── Device enrollment ───────────────────────────────────────────────────────

// Must match the agent's hostId formula — sha256("rootwatch-host:" +
// machine-id) — so this machine is one device row whether reports come from
// LCC, the RootWatch desktop sensor, or both.
let cachedHostId: string | null = null
async function deviceHostId(): Promise<string> {
  if (cachedHostId) return cachedHostId
  let basis = hostname()
  try {
    const mid = (await readFile('/etc/machine-id', 'utf8')).trim()
    if (mid) basis = mid
  } catch { /* hostname fallback — same rule as the agent */ }
  cachedHostId = createHash('sha256').update(`rootwatch-host:${basis}`).digest('hex')
  return cachedHostId
}

let pendingEnroll: { baseUrl: string; code: string; secret: string; expiresAt: string } | null = null

export async function rwEnrollStart(): Promise<{ code: string; verifyUrl: string; expiresAt: string }> {
  const config = await loadConfig()
  if (!config) throw new Error('Connect to a RootWatch instance first')
  const json = (await rwFetch(config.baseUrl, '/api/v1/enroll/start', {
    method: 'POST',
    body: { hostname: hostname(), os: `${process.platform} ${release()}` }
  })) as { code: string; secret: string; verifyUrl: string; expiresAt: string }

  pendingEnroll = { baseUrl: config.baseUrl, code: json.code, secret: json.secret, expiresAt: json.expiresAt }
  void shell.openExternal(json.verifyUrl)
  return { code: json.code, verifyUrl: json.verifyUrl, expiresAt: json.expiresAt }
}

export async function rwEnrollClaim(): Promise<'pending' | 'approved'> {
  if (!pendingEnroll) throw new Error('No enrollment pending — start again')
  const { baseUrl, code, secret, expiresAt } = pendingEnroll
  if (Date.now() > new Date(expiresAt).getTime()) {
    pendingEnroll = null
    throw new Error('Enrollment code expired — start again')
  }
  const res = await net.fetch(`${baseUrl}/api/v1/enroll/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, secret }),
    signal: AbortSignal.timeout(10_000)
  })
  if (res.status === 202) return 'pending'
  const json = (await res.json().catch(() => null)) as
    | { status?: string; token?: string; error?: { message?: string } }
    | null
  if (res.ok && json?.status === 'approved' && json.token) {
    const sealed = sealToken(json.token)
    const config = (await loadConfig()) as RwConfig
    config.deviceTokenEnc = sealed.enc
    config.deviceToken = sealed.plain
    config.deviceEnrolledAt = new Date().toISOString()
    await saveConfig(config)
    pendingEnroll = null
    startReporter()
    return 'approved'
  }
  pendingEnroll = null
  throw new Error(json?.error?.message ?? `Enrollment failed (HTTP ${res.status})`)
}

// ── Lightweight device reporter ─────────────────────────────────────────────
// LCC reports the fields it genuinely collects — package/update state,
// basic metrics, its own ops journal and scan history — as a free-form
// `report` record. The heavy sensor surface (listeners, keys, malware) is
// left to the RootWatch desktop agent; both reporters share one device row
// via the same hostId.

const REPORT_INTERVAL_MS = 5 * 60_000 // device "online" threshold is 15min

let reportTimer: ReturnType<typeof setInterval> | null = null
let reportBusy = false
let lastReportAt: string | null = null
let lastReportError: string | null = null

type RwCommand = { id?: number; type: string; payload?: unknown }
type CommandResult = { commandId?: number; status: 'done' | 'failed' | 'unsupported'; result?: unknown }

// Offline queue — failed report bodies persist to disk and replay oldest-first
// after the next successful report (24h TTL, same rule as the RW agent).
const queueFile = () => join(app.getPath('userData'), 'rw-report-queue.json')
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000
const QUEUE_MAX = 50

async function queueReport(body: unknown): Promise<void> {
  try {
    const q = JSON.parse(await readFile(queueFile(), 'utf8').catch(() => '[]')) as { ts: number; body: unknown }[]
    q.push({ ts: Date.now(), body })
    await writeFile(queueFile(), JSON.stringify(q.slice(-QUEUE_MAX)))
  } catch { /* best-effort */ }
}

async function flushQueue(config: RwConfig, token: string): Promise<void> {
  const raw = await readFile(queueFile(), 'utf8').catch(() => '')
  if (!raw) return
  let q: { ts: number; body: unknown }[] = []
  try { q = JSON.parse(raw) } catch { return }
  const fresh = q.filter((e) => Date.now() - e.ts < QUEUE_TTL_MS)
  let idx = 0
  for (; idx < fresh.length; idx++) {
    try {
      await rwFetch(config.baseUrl, '/api/v1/devices/report', { method: 'POST', body: fresh[idx].body, token })
    } catch {
      break // preserve order: stop at the first failure, retry next report
    }
  }
  await writeFile(queueFile(), JSON.stringify(fresh.slice(idx))).catch(() => {})
}

async function cpuPercent(): Promise<number | null> {
  const read = async () => {
    const line = (await readFile('/proc/stat', 'utf8')).split('\n')[0]
    const parts = line.trim().split(/\s+/).slice(1).map(Number)
    const idle = parts[3] + (parts[4] ?? 0)
    return { idle, total: parts.reduce((a, b) => a + b, 0) }
  }
  const a = await read()
  await new Promise((r) => setTimeout(r, 250))
  const b = await read()
  const dTotal = b.total - a.total
  return dTotal > 0 ? Math.round((1 - (b.idle - a.idle) / dTotal) * 100) : null
}

async function buildReport(): Promise<Record<string, unknown>> {
  const [memInfo, aptOut, cpu, securityHistory] = await Promise.all([
    readFile('/proc/meminfo', 'utf8').catch(() => ''),
    run('apt list --upgradable 2>/dev/null').catch(() => ''),
    cpuPercent().catch(() => null),
    readFile(join(app.getPath('userData'), 'security-history.json'), 'utf8').catch(() => '')
  ])

  const memGet = (key: string) => parseInt(memInfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? '0') || 0
  const memTotal = memGet('MemTotal')
  const memPercent = memTotal > 0 ? Math.round(((memTotal - memGet('MemAvailable')) / memTotal) * 100) : null

  let diskPercent: number | null = null
  try {
    const fs = statfsSync('/')
    if (fs.blocks > 0) diskPercent = Math.round((1 - fs.bavail / fs.blocks) * 100)
  } catch { /* statfs unavailable */ }

  const upgradeLines = aptOut.split('\n').filter((l) => l.includes('[upgradable'))
  const securityCount = upgradeLines.filter((l) => l.toLowerCase().includes('-security')).length

  let security: Record<string, unknown> | undefined
  try {
    const history = JSON.parse(securityHistory) as Record<string, { result?: unknown; finishedAt?: string }>
    security = {
      clamav: history.clamav ? { result: history.clamav.result, finishedAt: history.clamav.finishedAt } : null,
      lynis: history.lynis ? { result: history.lynis.result, finishedAt: history.lynis.finishedAt } : null
    }
  } catch { /* no scan history */ }

  return {
    updates: { count: upgradeLines.length, securityCount },
    metrics: { cpuPercent: cpu, memPercent, diskPercent },
    lcc: {
      rebootRequired: existsSync('/var/run/reboot-required'),
      recentOps: readOps(5),
      ...(security ? { security } : {})
    }
  }
}

async function postReport(
  config: RwConfig,
  token: string,
  commandResults?: CommandResult[]
): Promise<RwCommand[]> {
  const body = {
    hostId: await deviceHostId(),
    hostname: hostname(),
    os: `${process.platform} ${release()}`,
    platform: 'linux',
    agentVersion: `lcc-${app.getVersion()}`,
    reportId: randomUUID(),
    report: await buildReport(),
    ...(commandResults?.length ? { commandResults } : {})
  }
  try {
    const json = (await rwFetch(config.baseUrl, '/api/v1/devices/report', {
      method: 'POST', body, token
    })) as { data?: { commands?: RwCommand[] } }
    return json?.data?.commands ?? []
  } catch (e) {
    await queueReport(body)
    throw e
  }
}

// Fleet command execution (R4-lite): a small whitelist of command types this
// agent can genuinely run — everything else is acknowledged 'unsupported'
// rather than faked.
async function executeCommand(c: RwCommand): Promise<CommandResult> {
  try {
    if (c.type === 'refresh') return { commandId: c.id, status: 'done' }
    if (c.type === 'stop-listener') {
      const pid = Number((c.payload as { pid?: unknown })?.pid)
      if (!Number.isInteger(pid) || pid <= 1) return { commandId: c.id, status: 'failed', result: 'invalid pid' }
      await privilegedOp('kill-process', String(pid), 'TERM')
      return { commandId: c.id, status: 'done' }
    }
    return { commandId: c.id, status: 'unsupported' }
  } catch (e) {
    return { commandId: c.id, status: 'failed', result: e instanceof Error ? e.message : String(e) }
  }
}

async function reportOnce(): Promise<void> {
  if (reportBusy) return
  reportBusy = true
  try {
    const config = await loadConfig()
    const token = config ? await getDeviceToken(config) : null
    if (!config || !token) { stopReporter(); return }

    const commands = await postReport(config, token)
    lastReportAt = new Date().toISOString()
    lastReportError = null
    await flushQueue(config, token)

    if (commands.length > 0) {
      // Commands are claimed by the POST that delivered them — run what's
      // executable, ack the rest 'unsupported', then post results back.
      const refresh = commands.some((c) => c.type === 'refresh')
      const results = await Promise.all(commands.map(executeCommand))
      if (refresh) await postReport(config, token).catch(() => [])
      await postReport(config, token, results).catch(() => [])
      lastReportAt = new Date().toISOString()
    }
  } catch (e) {
    lastReportError = e instanceof Error ? e.message : String(e)
    writeLog('warn', 'rootwatch', `device report failed: ${lastReportError}`)
  } finally {
    reportBusy = false
  }
}

export function startReporter(): void {
  if (reportTimer) return
  reportTimer = setInterval(() => void reportOnce(), REPORT_INTERVAL_MS)
  setTimeout(() => void reportOnce(), 3000)
}

export function stopReporter(): void {
  if (reportTimer) clearInterval(reportTimer)
  reportTimer = null
}

/** Called once at app start — resumes reporting if this device was enrolled. */
export async function initRootWatch(): Promise<void> {
  const config = await loadConfig()
  if (config && (config.deviceTokenEnc || config.deviceToken)) startReporter()
}

// ── Remediations ────────────────────────────────────────────────────────────

export type RwRemediationDetail = {
  id: number
  title: string
  description: string
  category: string
  risk: string
  status: string
  deviceId: number | null
  plan: { label: string; argv: string[] }[]
  rollbackPlan: { label: string; argv: string[] }[] | null
  createdAt: string
}

export async function rwRemediation(id: number): Promise<RwRemediationDetail> {
  const config = await loadConfig()
  if (!config) throw new Error('Not connected')
  const token = await getToken(config)
  if (!token) throw new Error('Stored token could not be decrypted')
  return rwApi<RwRemediationDetail>(config.baseUrl, `/api/v1/remediations/${id}`, token)
}

/** Execute on the instance — needs an admin-scope token; 403s surface honestly. */
export async function rwRemediateRemote(id: number, confirmRemote: boolean): Promise<{ status: string; result?: unknown }> {
  const config = await loadConfig()
  if (!config) throw new Error('Not connected')
  const token = await getToken(config)
  if (!token) throw new Error('Stored token could not be decrypted')

  const action = await rwApi<RwRemediationDetail>(config.baseUrl, `/api/v1/remediations/${id}`, token)
  if (action.status === 'proposed') {
    await rwFetch(config.baseUrl, `/api/v1/remediations/${id}/approve`, {
      method: 'POST', body: {}, token
    })
  }
  const res = (await rwFetch(config.baseUrl, `/api/v1/remediations/${id}/execute`, {
    method: 'POST', body: confirmRemote ? { confirmRemote: true } : {}, token
  })) as { data?: { status?: string; result?: unknown } }
  return { status: res?.data?.status ?? 'executing', result: res?.data?.result }
}

// Map a RootWatch remediation plan (fixed argv steps from its catalog) onto
// this app's own whitelisted helper ops — never arbitrary argv. Any step that
// can't map makes the whole plan refuse upfront, before anything runs.
type MappedStep = { label: string; op: string; args: string[]; streaming?: boolean }
type PlanMapping = { ok: true; steps: MappedStep[] } | { ok: false; missing: string[] }

function mapPlanStep(argv: string[]): MappedStep | null {
  const [bin, ...a] = argv

  if (bin === 'systemctl') {
    const [verb, unit] = a
    if (verb === 'daemon-reload') {
      return { label: 'systemctl daemon-reload', op: 'service-action', args: ['daemon-reload'] }
    }
    if (!['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'mask', 'unmask'].includes(verb ?? '')) return null
    const svc = unit?.endsWith('.service') || unit?.endsWith('.timer') ? unit : `${unit}.service`
    return { label: `systemctl ${verb} ${svc}`, op: 'service-action', args: [verb, svc] }
  }

  if (bin === 'sshd' && a[0] === '-t') {
    return { label: 'sshd -t', op: 'sshd-validate', args: [] }
  }

  if (bin === 'ufw') {
    const args = a.filter((x) => x !== '--force')
    if (args[0] === 'enable' || args[0] === 'disable') {
      return { label: `ufw ${args[0]}`, op: 'firewall-action', args: [args[0]] }
    }
    if (args[0] === 'delete' && ['allow', 'deny', 'reject'].includes(args[1] ?? '')) {
      const [port, proto = 'any'] = (args[2] ?? '').split('/')
      if (!/^\d+$/.test(port)) return null
      return { label: `ufw delete ${args[1]} ${args[2]}`, op: 'firewall-delete-match', args: [args[1], `${port}/${proto === 'any' ? '' : proto}`.replace(/\/$/, '')] }
    }
    if (['allow', 'deny', 'reject'].includes(args[0] ?? '')) {
      const [port, proto = 'any'] = (args[1] ?? '').split('/')
      if (!/^\d+$/.test(port)) return null
      return { label: `ufw ${args[0]} ${args[1]}`, op: 'firewall-rule-add', args: [args[0], port, proto] }
    }
    return null
  }

  if (bin === 'apt-get') {
    const pkgs = a.filter((x) => !x.startsWith('-'))
    const verb = a.find((x) => ['install', 'purge', 'upgrade', 'autoremove'].includes(x))
    if (verb === 'install' && pkgs.length === 1) {
      return { label: `apt-get install ${pkgs[0]}`, op: 'apt-install', args: [pkgs[0]], streaming: true }
    }
    if (verb === 'install') return null // multi-package — expanded by expandPlan
    if (verb === 'purge' && pkgs.length > 0) {
      return { label: `apt-get purge ${pkgs.join(' ')}`, op: 'apt-purge', args: pkgs, streaming: true }
    }
    if (verb === 'upgrade') {
      return { label: 'apt-get upgrade', op: 'apt-upgrade-all', args: [], streaming: true }
    }
    if (verb === 'autoremove') {
      return { label: 'apt-get autoremove', op: 'apt-autoremove', args: [], streaming: true }
    }
    return null
  }

  return null
}

function expandPlan(plan: { label: string; argv: string[] }[]): PlanMapping {
  const steps: MappedStep[] = []
  const missing: string[] = []
  for (const step of plan) {
    const argv = step.argv
    // `apt-get update` steps are already covered — every apt op in the helper
    // runs the lists-refresh itself first.
    if (argv[0] === 'apt-get' && argv[1] === 'update') continue
    // apt-install is single-package — expand multi-package installs into one
    // step per package rather than widening the helper's surface.
    if (argv[0] === 'apt-get' && argv.slice(1).includes('install')) {
      const pkgs = argv.slice(1).filter((x) => !x.startsWith('-') && x !== 'install')
      if (pkgs.length > 1) {
        for (const p of pkgs) {
          steps.push({ label: `apt-get install ${p}`, op: 'apt-install', args: [p], streaming: true })
        }
        continue
      }
    }
    const mapped = mapPlanStep(argv)
    if (mapped) steps.push(mapped)
    else missing.push(step.label)
  }
  return missing.length ? { ok: false, missing } : { ok: true, steps }
}

export type LocalRunResult = {
  ran: boolean
  unmapped?: string[]
  steps?: { label: string; ok: boolean; detail?: string }[]
}

/** Run a remediation's plan locally through the pkexec helper whitelist. */
export async function rwRunLocal(id: number): Promise<LocalRunResult> {
  const action = await rwRemediation(id)
  const mapping = expandPlan(action.plan ?? [])
  if (!mapping.ok) return { ran: false, unmapped: mapping.missing }

  const results: { label: string; ok: boolean; detail?: string }[] = []
  for (const step of mapping.steps) {
    try {
      if (step.streaming) await privilegedOpStreaming(step.op, step.args, () => {})
      else await privilegedOp(step.op, ...step.args)
      results.push({ label: step.label, ok: true })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      results.push({ label: step.label, ok: false, detail })
      return { ran: true, steps: results } // stop at first failure
    }
  }
  return { ran: true, steps: results }
}
