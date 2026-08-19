import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { readFile, readdir } from 'fs/promises'
import { run } from './shell'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) {
      throw new Error('CLAUDE_API_KEY is not set — add it to .env.local and restart the app')
    }
    client = new Anthropic({ apiKey })
  }
  return client
}

const SYSTEM_PROMPT = `You are a Linux systems diagnostics assistant embedded in Linux Command Centre, a desktop system management app. The user will ask about system performance or behavior on their own machine.

Use the available tools to gather live data before answering — never guess. Pressure stall information (PSI) is a more reliable signal of real contention than raw CPU%, since a system can look idle in aggregate while still stalling. Correlate multiple signals rather than relying on just one tool's output before concluding.

Give a concise, plain-language diagnosis: what's actually happening, the likely root cause, and a concrete next step if one exists. Keep the final answer under 200 words unless the user asks for more detail.`

async function getSystemOverviewData(): Promise<Record<string, unknown>> {
  const loadAvg = await readFile('/proc/loadavg', 'utf8').catch(() => '0 0 0')
  const [load1, load5, load15] = loadAvg.split(' ').map(parseFloat)
  const uptimeRaw = await readFile('/proc/uptime', 'utf8').catch(() => '0')
  const uptimeSecs = parseFloat(uptimeRaw.split(' ')[0]) || 0
  const memInfo = await readFile('/proc/meminfo', 'utf8').catch(() => '')
  const memGet = (key: string): number =>
    (parseInt(memInfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? '0') || 0) * 1024
  const cpuInfo = await readFile('/proc/cpuinfo', 'utf8').catch(() => '')
  const cpuModel = cpuInfo.match(/^model name\s*:\s*(.+)/m)?.[1]?.trim() ?? 'unknown'
  const cpuCores = (cpuInfo.match(/^processor\s*:/gm) || []).length

  return {
    uptimeHours: Math.round((uptimeSecs / 3600) * 10) / 10,
    loadAverage: { '1min': load1 || 0, '5min': load5 || 0, '15min': load15 || 0 },
    cpu: { model: cpuModel, logicalCores: cpuCores },
    memoryBytes: {
      total: memGet('MemTotal'),
      available: memGet('MemAvailable'),
      swapTotal: memGet('SwapTotal'),
      swapFree: memGet('SwapFree')
    }
  }
}

async function readPressure(kind: 'cpu' | 'memory' | 'io'): Promise<string> {
  return readFile(`/proc/pressure/${kind}`, 'utf8').catch(() => 'unavailable on this kernel')
}

async function getThermalStatusData(): Promise<Record<string, unknown>> {
  const zones = await readdir('/sys/class/thermal').catch(() => [])
  const temps: Record<string, number> = {}
  for (const zone of zones) {
    if (!zone.startsWith('thermal_zone')) continue
    const type = (await readFile(`/sys/class/thermal/${zone}/type`, 'utf8').catch(() => '')).trim()
    const tempRaw = (await readFile(`/sys/class/thermal/${zone}/temp`, 'utf8').catch(() => '')).trim()
    if (type && tempRaw) temps[type] = Math.round(parseInt(tempRaw) / 1000)
  }
  const throttleSum = await run(
    `for f in /sys/devices/system/cpu/cpu*/thermal_throttle/core_throttle_count; do cat "$f" 2>/dev/null; done | awk '{s+=$1} END {print s+0}'`
  ).catch(() => '0')
  return {
    temperaturesCelsius: temps,
    totalThermalThrottleEventsSinceBoot: parseInt(throttleSum) || 0
  }
}

/** Builds a fresh tool set. `onToolUse` is called with each tool's name as it runs, for UI transparency. */
function buildTools(onToolUse: (name: string) => void) {
  return [
    betaZodTool({
      name: 'get_system_overview',
      description:
        'Get uptime, load averages, CPU model/core count, and memory/swap usage in bytes.',
      inputSchema: z.object({}),
      run: async () => {
        onToolUse('get_system_overview')
        return JSON.stringify(await getSystemOverviewData())
      }
    }),
    betaZodTool({
      name: 'get_pressure_stall_info',
      description:
        "Get Linux PSI (pressure stall information) for CPU, memory, and IO — the most reliable signal for whether the system is actually bottlenecked right now, even when aggregate CPU% looks idle. avg10/avg60/avg300 are the percent of time stalled over the last 10/60/300 seconds; 'full' means all tasks stalled simultaneously.",
      inputSchema: z.object({}),
      run: async () => {
        onToolUse('get_pressure_stall_info')
        const [cpu, memory, io] = await Promise.all([
          readPressure('cpu'),
          readPressure('memory'),
          readPressure('io')
        ])
        return JSON.stringify({ cpu, memory, io })
      }
    }),
    betaZodTool({
      name: 'get_top_processes',
      description: 'List the top processes by CPU or memory usage right now.',
      inputSchema: z.object({
        sortBy: z.enum(['cpu', 'mem']).default('cpu').describe('Sort processes by CPU or memory usage'),
        limit: z.number().int().min(1).max(30).default(10).describe('Number of processes to return')
      }),
      run: async (input) => {
        onToolUse('get_top_processes')
        const col = input.sortBy === 'mem' ? '-%mem' : '-%cpu'
        const out = await run(
          `ps -eo pid,%cpu,%mem,etimes,comm --sort=${col} --no-headers | head -${input.limit}`
        ).catch(() => '')
        return out || 'no data'
      }
    }),
    betaZodTool({
      name: 'get_thermal_status',
      description:
        'Get CPU thermal zone temperatures and the cumulative count of thermal throttle events since boot. A high or climbing throttle count indicates the CPU is hitting its thermal/power limit and slowing itself down.',
      inputSchema: z.object({}),
      run: async () => {
        onToolUse('get_thermal_status')
        return JSON.stringify(await getThermalStatusData())
      }
    }),
    betaZodTool({
      name: 'get_disk_status',
      description: 'Get disk space usage per mounted filesystem (excludes virtual filesystems).',
      inputSchema: z.object({}),
      run: async () => {
        onToolUse('get_disk_status')
        const out = await run('df -h -x tmpfs -x devtmpfs -x squashfs -x overlay').catch(() => '')
        return out || 'no data'
      }
    }),
    betaZodTool({
      name: 'get_recent_error_logs',
      description:
        'Get the most recent error/critical-priority system log entries (journalctl). Useful for spotting crashes, OOM kills, or hardware errors.',
      inputSchema: z.object({
        lines: z.number().int().min(1).max(50).default(15).describe('Max number of log lines to return')
      }),
      run: async (input) => {
        onToolUse('get_recent_error_logs')
        const out = await run(`journalctl -p 3 -n ${input.lines} --no-pager -o short 2>/dev/null`).catch(
          () => ''
        )
        return out || 'no recent error-level log entries'
      }
    })
  ]
}

export interface DiagnosisResult {
  text: string
  toolsUsed: string[]
}

export async function runDiagnostics(query: string): Promise<DiagnosisResult> {
  const anthropic = getClient()
  const toolsUsed: string[] = []
  const tools = buildTools((name) => toolsUsed.push(name))

  const finalMessage = await anthropic.beta.messages.toolRunner({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT,
    tools,
    messages: [{ role: 'user', content: query }]
  })

  const text = finalMessage.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return { text: text || '(no response)', toolsUsed }
}
