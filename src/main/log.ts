import { app } from 'electron'
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

// The app's own structured log + operations journal. The system journal is
// where pkexec/apt chatter already lives; these files record what *we* did
// and what failed, so a bug report doesn't start with "run journalctl".

export type LogLevel = 'info' | 'warn' | 'error'
export type ErrClass =
  | 'lock-busy'
  | 'auth-cancelled'
  | 'timeout'
  | 'spawn'
  | 'unknown'
  | `exit-${number}`

export interface OpRecord {
  ts: string
  op: string
  args: string[]
  stdinBytes?: number
  durationMs: number
  ok: boolean
  errClass?: ErrClass
  errMsg?: string
}

const LOG_MAX_BYTES = 2 * 1024 * 1024 // lcc.log → lcc.log.1, keep 2 files
const OPS_MAX_BYTES = 400 * 1024
const OPS_KEEP_LINES = 800

const logDir = () => join(app.getPath('userData'), 'logs')
const logFile = () => join(logDir(), 'lcc.log')
const opsFile = () => join(logDir(), 'operations.jsonl')

let dirReady = false

function ensureDir(): void {
  if (dirReady) return
  mkdirSync(logDir(), { recursive: true })
  dirReady = true
}

export function classifyError(message: string): ErrClass {
  const m = message.toLowerCase()
  if (/could not get lock|unable to (acquire|lock)/.test(m)) return 'lock-busy'
  if (/authentication cancelled|pkexec not available/.test(m)) return 'auth-cancelled'
  if (/timed?\s*out|etimedout/.test(m)) return 'timeout'
  if (/enoent|spawn\s+\S+\s+enoent/.test(m)) return 'spawn'
  const exit = m.match(/exit(?:ed)?(?: with)?(?: status| code)?[:\s]+(\d+)/)
  if (exit) return `exit-${Number(exit[1])}`
  return 'unknown'
}

export function writeLog(level: LogLevel, scope: string, msg: string, extra?: Record<string, unknown>): void {
  try {
    ensureDir()
    const file = logFile()
    try {
      if (statSync(file).size > LOG_MAX_BYTES) {
        try { unlinkSync(`${file}.1`) } catch { /* no previous rotation */ }
        renameSync(file, `${file}.1`)
      }
    } catch { /* file doesn't exist yet */ }
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      msg: msg.slice(0, 4000),
      ...extra
    })
    appendFileSync(file, `${line}\n`)
  } catch { /* logging must never take the app down */ }

  if (!app.isPackaged) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    fn(`[${scope}] ${msg}`)
  }
}

// Secrets never travel on helper argv (they go over stdin — see
// privilegedOpWithStdin), so journaling op + args verbatim is safe by design.
export function recordOp(rec: Omit<OpRecord, 'ts'>): void {
  try {
    ensureDir()
    const file = opsFile()
    try {
      if (statSync(file).size > OPS_MAX_BYTES) {
        const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
        writeFileSync(file, `${lines.slice(-OPS_KEEP_LINES).join('\n')}\n`)
      }
    } catch { /* file doesn't exist yet */ }
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...rec })}\n`)
  } catch { /* best-effort */ }
}

/** Last `lines` lines of the app log, oldest-first, for diagnostics export. */
export function readLogTail(lines = 300): string {
  try {
    const all = readFileSync(logFile(), 'utf8').split('\n')
    return all.slice(-Math.min(Math.max(lines, 1), 5000)).join('\n').trim()
  } catch {
    return ''
  }
}

/** Newest-first. */
export function readOps(limit = 50): OpRecord[] {
  try {
    return readFileSync(opsFile(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-Math.min(Math.max(limit, 1), 500))
      .reverse()
      .map((l) => JSON.parse(l) as OpRecord)
  } catch {
    return []
  }
}
