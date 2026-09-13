import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

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

/**
 * Run a privileged operation via pkexec + lcc-helper.
 * Triggers the native GNOME polkit authentication dialog.
 */
export async function privilegedOp(operation: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pkexec', [...helperCommand(), operation, ...args], {
      timeout: 30000
    })
    return stdout.trim()
  } catch (e: unknown) {
    const err = e as { code?: number; stderr?: string; message?: string }
    if (err.code === 126 || err.code === 127) {
      throw new Error('Authentication cancelled or pkexec not available')
    }
    throw new Error(err.stderr?.trim() || err.message || 'Privileged operation failed')
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
    const child = spawn('pkexec', [...helperCommand(), operation, ...args])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    child.on('error', (err) => reject(new Error(err.message)))
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else if (code === 126 || code === 127) {
        reject(new Error('Authentication cancelled or pkexec not available'))
      } else {
        const detail = stderr.trim().replace(/^Error:\s*/i, '')
        reject(new Error(detail || `Operation exited with status ${code ?? 'unknown'}`))
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
    const child = spawn('pkexec', [...helperCommand(), operation, ...args])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      stdout += output
      onOutput(output)
    })
    child.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      stderr += output
      onOutput(output)
    })
    child.on('error', (err) => reject(new Error(err.message)))
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else if (code === 126 || code === 127) {
        reject(new Error('Authentication cancelled or pkexec not available'))
      } else {
        const detail = stderr.trim().replace(/^Error:\s*/i, '')
        reject(new Error(detail || `Upgrade process exited with status ${code ?? 'unknown'}`))
      }
    })
  })
}
