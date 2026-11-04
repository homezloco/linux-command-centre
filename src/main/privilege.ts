import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { classifyError, recordOp, writeLog, type ErrClass } from './log'

const execFileAsync = promisify(execFile)

// Installed root:root, mode 0755, by the .deb/.rpm postinst script (see
// helper/after-install.sh) or the snap's install/post-refresh hooks.
// The polkit action io.lcc.helper.run is bound to this exact path — see
// helper/io.lcc.helper.policy — so pkexec only auto-authorizes this fixed
// script, never an arbitrary `pkexec node <anything>` invocation.
const INSTALLED_WRAPPER = '/usr/lib/linux-command-centre/lcc-helper'

/** Path to the helper script bundled with the app. */
function helperScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'helper', 'lcc-helper.js')
  }
  return join(__dirname, '../../helper/lcc-helper.js')
}

/**
 * Argv prefix used to reach the helper via pkexec. Prefers the installed
 * wrapper so the polkit policy's exec.path match is meaningful. Falls back
 * to invoking `node <script>` directly for AppImage/tar.gz builds (which
 * have no postinst step to install the wrapper) and for `npm run dev` —
 * in both cases pkexec falls back to its generic admin-auth prompt instead
 * of the one bound to io.lcc.helper.run.
 */
function helperCommand(): string[] {
  if (existsSync(INSTALLED_WRAPPER)) return [INSTALLED_WRAPPER]
  return ['node', helperScriptPath()]
}

// apt names the process holding a lock only in "…held by process N (name)"
// lines; the final failure just says the lock couldn't be acquired.
function lockHolderFrom(text: string): string {
  const m = text.match(/held by process (\d+)(?: \(([^)]+)\))?/)
  return m ? (m[2] || `PID ${m[1]}`) : ''
}

function lockBusyError(holder: string): Error {
  return new Error(
    `Another package manager${holder ? ` (${holder})` : ''} is using apt. ` +
    'It usually finishes within a few minutes — wait a moment and try again.'
  )
}

function journalFailure(
  operation: string,
  args: string[],
  startedAt: number,
  errMsg: string,
  errClass: ErrClass,
  extra?: Record<string, unknown>
): void {
  recordOp({
    op: operation, args, durationMs: Date.now() - startedAt,
    ok: false, errClass, errMsg: errMsg.slice(0, 500)
  })
  writeLog('warn', 'privilege', `${operation} failed`, { errClass, ...extra })
}

function journalSuccess(operation: string, args: string[], startedAt: number): void {
  recordOp({ op: operation, args, durationMs: Date.now() - startedAt, ok: true })
}

/**
 * Run a privileged operation via pkexec + lcc-helper.
 * Triggers the native GNOME polkit authentication dialog.
 */
export async function privilegedOp(operation: string, ...args: string[]): Promise<string> {
  const startedAt = Date.now()
  try {
    const { stdout } = await execFileAsync('pkexec', [...helperCommand(), operation, ...args], {
      timeout: 30000
    })
    journalSuccess(operation, args, startedAt)
    return stdout.trim()
  } catch (e: unknown) {
    const err = e as { code?: number; killed?: boolean; stderr?: string; message?: string }
    const detail = (err.stderr?.trim() || err.message || 'Privileged operation failed')
      .replace(/^Error:\s*/i, '')
    const errClass: ErrClass = err.killed ? 'timeout'
      : (err.code === 126 || err.code === 127) ? 'auth-cancelled'
      : classifyError(detail)
    journalFailure(operation, args, startedAt, detail, errClass)
    if (err.code === 126 || err.code === 127) {
      throw new Error('Authentication cancelled or pkexec not available')
    }
    if (errClass === 'lock-busy') throw lockBusyError(lockHolderFrom(detail))
    throw new Error(detail)
  }
}

/**
 * Run a privileged operation via pkexec + lcc-helper, feeding `stdin` to the helper's
 * standard input instead of a shared file path. Used for operations that write untrusted
 * content (e.g. /etc/hosts, /etc/resolv.conf) so there's no predictable on-disk file for a
 * local process to race between our write and the root helper's read.
 */
export function privilegedOpWithStdin(operation: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const child = spawn('pkexec', [...helperCommand(), operation, ...args])
    let stdout = ''
    let stderr = ''
    let journaled = false

    const fail = (errMsg: string, errClass: ErrClass) => {
      if (journaled) return
      journaled = true
      recordOp({
        op: operation, args, stdinBytes: stdin.length, durationMs: Date.now() - startedAt,
        ok: false, errClass, errMsg: errMsg.slice(0, 500)
      })
      writeLog('warn', 'privilege', `${operation} failed`, { errClass })
    }

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    child.on('error', (err) => {
      fail(err.message, 'spawn')
      reject(new Error(err.message))
    })
    child.on('close', (code) => {
      if (code === 0) {
        if (!journaled) recordOp({ op: operation, args, stdinBytes: stdin.length, durationMs: Date.now() - startedAt, ok: true })
        resolve(stdout.trim())
      } else if (code === 126 || code === 127) {
        const msg = 'Authentication cancelled or pkexec not available'
        fail(msg, 'auth-cancelled')
        reject(new Error(msg))
      } else {
        const detail = stderr.trim().replace(/^Error:\s*/i, '')
        if (/could not get lock|unable to (acquire|lock)/i.test(stdout + stderr)) {
          const err = lockBusyError(lockHolderFrom(stdout + stderr))
          fail(err.message, 'lock-busy')
          reject(err)
          return
        }
        const msg = detail || `Operation exited with status ${code ?? 'unknown'}`
        fail(msg, classifyError(msg))
        reject(new Error(msg))
      }
    })

    child.stdin.write(stdin)
    child.stdin.end()
  })
}

export function privilegedOpStreaming(
  operation: string,
  args: string[],
  onOutput: (output: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const child = spawn('pkexec', [...helperCommand(), operation, ...args])
    let stdout = ''
    let stderr = ''
    let journaled = false
    // apt reports the process holding its lock only in the "Waiting for cache
    // lock" lines it emits while DPkg::Lock::Timeout is still running — the
    // final error just says the lock couldn't be acquired. Track the last
    // holder seen so a lock-conflict failure can name the culprit.
    let lockHolder = ''
    const trackLockHolder = (s: string) => {
      const m = s.match(/held by process (\d+)(?: \(([^)]+)\))?/)
      if (m) lockHolder = m[2] || `PID ${m[1]}`
    }

    const fail = (errMsg: string, errClass: ErrClass, extra?: Record<string, unknown>) => {
      if (journaled) return
      journaled = true
      recordOp({
        op: operation, args, durationMs: Date.now() - startedAt,
        ok: false, errClass, errMsg: errMsg.slice(0, 500)
      })
      writeLog('warn', 'privilege', `${operation} failed`, { errClass, ...extra })
    }

    child.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      stdout += output
      trackLockHolder(output)
      onOutput(output)
    })
    child.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      stderr += output
      trackLockHolder(output)
      onOutput(output)
    })
    child.on('error', (err) => {
      fail(err.message, 'spawn')
      reject(new Error(err.message))
    })
    child.on('close', (code) => {
      if (code === 0) {
        if (!journaled) journalSuccess(operation, args, startedAt)
        resolve(stdout.trim())
      } else if (code === 126 || code === 127) {
        const msg = 'Authentication cancelled or pkexec not available'
        fail(msg, 'auth-cancelled')
        reject(new Error(msg))
      } else if (/could not get lock|unable to (acquire|lock)/i.test(stdout + stderr)) {
        const err = lockBusyError(lockHolder)
        fail(err.message, 'lock-busy', { holder: lockHolder || undefined })
        reject(err)
      } else {
        const detail = stderr.trim().replace(/^Error:\s*/i, '')
        const msg = detail || `Upgrade process exited with status ${code ?? 'unknown'}`
        fail(msg, classifyError(msg))
        reject(new Error(msg))
      }
    })
  })
}
