import { Page } from '../components/ui/Page.svelte'
import { Card } from '../components/ui/Card.svelte'

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

interface QuickActions {
  label: string
  command: string
}

interface Props {
  health?: SystemHealth
  network?: NetworkStatus
  quickActions?: QuickActions[]
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

const DEFAULT_ACTIONS: QuickActions[] = [
  { label: 'Check Network', command: 'lcc network status' },
  { label: 'Check Storage', command: 'lcc storage status' },
  { label: 'Check Services', command: 'lcc services status' },
]

export let health: SystemHealth = DEFAULT_HEALTH
export let network: NetworkStatus = DEFAULT_NETWORK
export let quickActions: QuickActions[] = DEFAULT_ACTIONS

export function updateHealth(h: SystemHealth) {
  health = h
}

export function updateNetwork(n: NetworkStatus) {
  network = n
}

export function updateQuickActions(a: QuickActions[]) {
  quickActions = a
}

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

function StatRow({ label, value, status }: { label: string; value?: number; status?: string }) {
  return (
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted-foreground">{label}</span>
      <span class={`text-xs font-medium ${status ?? statusColor(value)}`}>{value ?? '—'}</span>
    </div>
  )
}

function QuickActionCard({ action }: { action: QuickActions }) {
  return (
    <Card padding="sm">
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-foreground">{action.label}</span>
        <span class="text-xs text-muted-foreground">Run via CLI</span>
        <code class="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{action.command}</code>
      </div>
    </Card>
  )
}

export default function HomeDashboard({
  health: healthProp,
  network: networkProp,
  quickActions: actionsProp,
}: {
  health?: SystemHealth
  network?: NetworkStatus
  quickActions?: QuickActions[]
}) {
  const health = healthProp ?? DEFAULT_HEALTH
  const network = networkProp ?? DEFAULT_NETWORK
  const actions = actionsProp ?? DEFAULT_ACTIONS

  return (
    <Page description="System overview and quick actions">
      <div class="grid gap-4 md:grid-cols-2">
        <Card>
          <div class="flex flex-col gap-3">
            <h3 class="text-sm font-semibold text-foreground">System Health</h3>
            <StatRow label="CPU" value={health.cpu} status={statusColor(health.cpu)} />
            <StatRow label="Memory" value={health.memory} status={statusColor(health.memory)} />
            <StatRow label="Disk" value={health.disk} status={statusColor(health.disk)} />
            <StatRow label="Uptime" value={formatUptime(health.uptime)} status={statusColor(health.uptime / 86400)} />
            <StatRow label="Services" value={health.services} status={statusColor(health.services, 99)} />
          </div>
        </Card>
        <Card>
          <div class="flex flex-col gap-3">
            <h3 class="text-sm font-semibold text-foreground">Network</h3>
            <StatRow label="Downloads" value={network.downloads} status={statusColor(network.downloads)} />
            <StatRow label="Uploads" value={network.uploads} status={statusColor(network.uploads)} />
            <StatRow label="Latency" value={network.latency} status={statusColor(network.latency, 100)} />
          </div>
        </Card>
      </div>
      <div class="mt-4 grid gap-4 md:grid-cols-3">
        {#each actions.slice(0, 3) as action (action.command)}
          <QuickActionCard action={action} />
        {/each}
      </div>
    </Page>
  )
}
