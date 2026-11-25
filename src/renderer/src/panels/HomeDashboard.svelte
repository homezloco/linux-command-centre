import { Page } from '../components/ui/Page.svelte'
import { Card } from '../components/ui/Card.svelte'
import { cn } from '$lib/utils'

interface SystemHealth {
  cpu?: number
  memory?: number
  disk?: number
  uptime?: number
  services?: number
}

interface NetworkStatus {
  downloads?: number
  uploads?: number
  latency?: number
}

interface QuickAction {
  label: string
  command: string
}

interface Props {
  health?: SystemHealth
  network?: NetworkStatus
  quickActions?: QuickAction[]
}

const DEFAULT_HEALTH: SystemHealth = {
  cpu: 0,
  memory: 0,
  disk: 0,
  uptime: 0,
  services: 0,
}

const DEFAULT_NETWORK: NetworkStatus = {
  downloads: 0,
  uploads: 0,
  latency: 0,
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: 'Check Network', command: 'lcc network status' },
  { label: 'Check Storage', command: 'lcc storage status' },
  { label: 'Check Services', command: 'lcc services status' },
]

let {
  health: healthProp,
  network: networkProp,
  quickActions: actionsProp,
}: Props = $props()

let health = $state<SystemHealth>(healthProp ?? DEFAULT_HEALTH)
let network = $state<NetworkStatus>(networkProp ?? DEFAULT_NETWORK)
let actions = $state<QuickAction[]>(actionsProp ?? DEFAULT_ACTIONS)

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function statusColor(value?: number, warnAt = 80): string {
  if (value === undefined || value === null) return 'text-muted-foreground'
  if (value > 90) return 'text-status-fail'
  if (value > warnAt) return 'text-status-warn'
  return 'text-status-ok'
}

{#snippet StatRow(label: string, value?: number | string, status?: string)}
  <div class="flex items-center justify-between">
    <span class="text-xs text-muted-foreground">{label}</span>
    <span class={cn('text-xs font-medium', status)}>{value ?? '—'}</span>
  </div>
{/snippet}

{#snippet QuickActionCard(action: QuickAction)}
  <Card padding="sm">
    <div class="flex flex-col gap-2">
      <span class="text-xs font-medium text-foreground">{action.label}</span>
      <span class="text-xs text-muted-foreground">Run via CLI</span>
      <code class="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{action.command}</code>
    </div>
  </Card>
{/snippet}

export default function HomeDashboard() {
  return (
    <Page description="System overview and quick actions">
      <div class="grid gap-4 md:grid-cols-2">
        <Card>
          <div class="flex flex-col gap-3">
            <h3 class="text-sm font-semibold text-foreground">System Health</h3>
            {@render StatRow('CPU', health?.cpu, statusColor(health?.cpu))}
            {@render StatRow('Memory', health?.memory, statusColor(health?.memory))}
            {@render StatRow('Disk', health?.disk, statusColor(health?.disk))}
            {@render StatRow('Uptime', formatUptime(health?.uptime), statusColor(health?.uptime ? health.uptime / 86400 : undefined))}
            {@render StatRow('Services', health?.services, statusColor(health?.services, 99))}
          </div>
        </Card>
        <Card>
          <div class="flex flex-col gap-3">
            <h3 class="text-sm font-semibold text-foreground">Network</h3>
            {@render StatRow('Downloads', network?.downloads, statusColor(network?.downloads))}
            {@render StatRow('Uploads', network?.uploads, statusColor(network?.uploads))}
            {@render StatRow('Latency', network?.latency, statusColor(network?.latency, 100))}
          </div>
        </Card>
      </div>
      <div class="mt-4 grid gap-4 md:grid-cols-3">
        {#each actions.slice(0, 3) as action (action.command)}
          {@render QuickActionCard(action)}
        {/each}
      </div>
    </Page>
  )
}
