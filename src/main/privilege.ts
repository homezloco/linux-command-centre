import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

/** Path to the privileged helper binary */
function helperPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'lcc-helper.js')
  }
  return join(__dirname, '../../helper/lcc-helper.js')
}

/**
 * Run a privileged operation via pkexec + lcc-helper.
 * Triggers the native GNOME polkit authentication dialog.
 */
export async function privilegedOp(operation: string, ...args: string[]): Promise<string> {
  const helper = helperPath()
  try {
    const { stdout } = await execFileAsync('pkexec', ['node', helper, operation, ...args], {
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

export function privilegedOpStreaming(
  operation: string,
  args: string[],
  onOutput: (output: string) => void
): Promise<string> {
  const helper = helperPath()
  return new Promise((resolve, reject) => {
    const child = spawn('pkexec', ['node', helper, operation, ...args])
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
