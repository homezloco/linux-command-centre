import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

/** Read a sysfs file, return empty string on failure */
export async function sysread(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf8')
    return content.trim()
  } catch {
    return ''
  }
}

/** Check if a sysfs path exists */
export function sysexists(path: string): boolean {
  return existsSync(path)
}

/** Run a shell command, return stdout. Throws on non-zero exit. */
export async function run(cmd: string, opts: { maxBuffer?: number } = {}): Promise<string> {
  const { stdout } = await execAsync(cmd, { maxBuffer: opts.maxBuffer ?? 1024 * 1024 })
  return stdout.trim()
}

/** Run a command with explicit args (safer than shell string) */
export async function runFile(file: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, args)
  return stdout.trim()
}

/** Run huawei-cli subcommand, return raw output */
export async function huaweiCli(...args: string[]): Promise<string> {
  try {
    return await runFile('/usr/local/bin/huawei', args)
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string }
    return err.stdout ?? err.stderr ?? ''
  }
}
