import { execFile } from 'child_process'
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
    throw new Error(err.stderr ?? err.message ?? 'Privileged operation failed')
  }
}
