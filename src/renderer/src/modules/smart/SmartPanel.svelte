<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, EmptyState } from '$ui'
  import { RefreshCw, HardDrive, AlertTriangle, CheckCircle2, XCircle, Lock } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Disk = { name: string; size: string; model: string; tran: string }
  type SmartAttr = {
    id: number; name: string; value: number; worst: number; thresh: number
    raw: { value: number; string: string }; when_failed: string
    flags: { prefailure: boolean }
  }
  type SmartData = {
    smart_status?: { passed: boolean }
    model_name?: string; serial_number?: string; firmware_version?: string
    temperature?: { current: number }
    power_on_time?: { hours: number }
    device?: { protocol: string }
    ata_smart_attributes?: { table: SmartAttr[] }
    nvme_smart_health_information_log?: {
      temperature: number; available_spare: number; percentage_used: number
      power_on_hours: number; media_errors: number; num_err_log_entries: number
      critical_warning: number; unsafe_shutdowns: number
    }
  }

  const TITLE = 'SMART'
  const labelCls = 'text-[11px] text-muted-foreground uppercase tracking-wide'

  let disks        = $state<Disk[]>([])
  let selected     = $state<string | null>(null)
  // smart:info is privileged — results are cached per device and only fetched on request
  let smartCache   = $state<Record<string, SmartData>>({})
  let loading      = $state(true)
  let refreshing   = $state(false)
  let loadingSmart = $state<string | null>(null)
  let error        = $state('')
  let smartError   = $state('')
  let showAll      = $state(false)

  const smartData = $derived(selected ? smartCache[selected] ?? null : null)

  // Critical attribute IDs — non-zero raw values indicate real problems
  const CRITICAL = new Set([5, 187, 188, 197, 198, 199])

  async function loadDisks(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      disks = await invoke<Disk[]>('smart:disks')
      if (!selected || !disks.some(d => `/dev/${d.name}` === selected)) {
        selected = disks.length > 0 ? `/dev/${disks[0].name}` : null
      }
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function loadSmart(device: string) {
    loadingSmart = device; smartError = ''
    try {
      const data = await invoke<SmartData>('smart:info', device)
      smartCache = { ...smartCache, [device]: data }
    } catch (e) {
      smartError = String(e)
      toasts.error(String(e), TITLE)
    }
    finally { loadingSmart = null }
  }

  function formatHours(h: number): string {
    if (h < 24)      return `${h}h`
    if (h < 8760)    return `${Math.floor(h / 24)}d`
    const years = Math.floor(h / 8760)
    const days  = Math.floor((h % 8760) / 24)
    return `${years}y ${days}d`
  }

  function attrFailed(a: SmartAttr): boolean {
    return a.when_failed !== '' || (a.thresh > 0 && a.value <= a.thresh)
  }

  function visibleAttrs(table: SmartAttr[]): SmartAttr[] {
    if (showAll) return table
    return table.filter(a => CRITICAL.has(a.id) || attrFailed(a))
  }

  function tempColor(t: number): string {
    if (t >= 60) return 'text-status-fail'
    if (t >= 45) return 'text-status-warn'
    return ''
  }

  onMount(() => { void loadDisks() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh disks"
      disabled={refreshing || loading}
      onclick={() => loadDisks(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <div class="flex gap-2">
        <Skeleton class="h-10 w-56" />
        <Skeleton class="h-10 w-56" />
      </div>
      <Skeleton class="h-40 w-full" />

    {:else if disks.length === 0}
      <EmptyState icon={HardDrive} title="No block devices found" message="lsblk reported no disks." />

    {:else}
      <!-- Disk selector (unprivileged, listed immediately) -->
      <div class="flex gap-2 flex-wrap" role="radiogroup" aria-label="Disk">
        {#each disks as disk (disk.name)}
          {@const dev = `/dev/${disk.name}`}
          <button
            type="button"
            role="radio"
            aria-checked={selected === dev}
            onclick={() => { selected = dev; smartError = '' }}
            class="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-[13px]
                   {selected === dev
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-border bg-card text-muted-foreground hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'}"
          >
            <HardDrive size={14} />
            <span class="font-mono">{dev}</span>
            {#if disk.model}<span class="text-xs opacity-70">· {disk.model}</span>{/if}
            <span class="text-xs opacity-70">{disk.size}</span>
            {#if smartCache[dev]}<CheckCircle2 size={12} class="text-status-ok" aria-label="Loaded" />{/if}
          </button>
        {/each}
      </div>

      {#if selected && !smartData}
        <!-- Per-disk gate: smart:info needs authentication, so it is never auto-invoked -->
        {#if smartError}<Alert message={smartError} />{/if}
        <EmptyState
          icon={Lock}
          title="Load SMART data for {selected}"
          message="Reading disk health with smartctl requires administrator authentication."
        >
          {#snippet action()}
            <Button variant="primary" size="sm" loading={loadingSmart === selected} onclick={() => loadSmart(selected!)}>
              {loadingSmart === selected ? 'Authenticating…' : 'Load disk health'}
            </Button>
          {/snippet}
        </EmptyState>

      {:else if smartData}
        {@const passed   = smartData.smart_status?.passed ?? true}
        {@const protocol = smartData.device?.protocol || 'ATA'}
        {@const temp     = smartData.temperature?.current ?? smartData.nvme_smart_health_information_log?.temperature}
        {@const hours    = smartData.power_on_time?.hours ?? smartData.nvme_smart_health_information_log?.power_on_hours}

        <!-- Health banner -->
        <Card class="flex items-center gap-4 {passed ? 'border-status-ok/30 bg-status-ok/5' : 'border-destructive/30 bg-destructive/10'}">
          {#if passed}
            <CheckCircle2 size={28} class="text-status-ok shrink-0" />
          {:else}
            <XCircle size={28} class="text-destructive shrink-0" />
          {/if}
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-semibold {passed ? 'text-status-ok' : 'text-destructive'}">
              {passed ? 'Health: PASSED' : 'Health: FAILED'}
            </p>
            {#if smartData.model_name}
              <p class="text-xs text-muted-foreground truncate">
                {smartData.model_name}{smartData.serial_number ? ` · S/N ${smartData.serial_number}` : ''}
                {smartData.firmware_version ? ` · FW ${smartData.firmware_version}` : ''}
              </p>
            {/if}
          </div>
          <div class="flex gap-4 text-right shrink-0">
            {#if temp != null}
              <div>
                <p class={labelCls}>Temp</p>
                <p class="text-[13px] font-medium tabular-nums {tempColor(temp)}">{temp}°C</p>
              </div>
            {/if}
            {#if hours != null}
              <div>
                <p class={labelCls}>Power-on</p>
                <p class="text-[13px] font-medium tabular-nums">{formatHours(hours)}</p>
              </div>
            {/if}
            <div>
              <p class={labelCls}>Protocol</p>
              <p class="text-[13px] font-medium">{protocol}</p>
            </div>
            <Button
              variant="icon"
              size="sm"
              aria-label="Reload SMART data for {selected}"
              loading={loadingSmart === selected}
              onclick={() => loadSmart(selected!)}
            >
              <RefreshCw size={13} />
            </Button>
          </div>
        </Card>

        <!-- NVMe metrics -->
        {#if smartData.nvme_smart_health_information_log}
          {@const n = smartData.nvme_smart_health_information_log}
          <Card class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">NVMe health log</p>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {#each [
                { label: 'Available spare',   value: `${n.available_spare}%`,       warn: n.available_spare < 10 },
                { label: 'Drive usage',       value: `${n.percentage_used}%`,       warn: n.percentage_used > 90 },
                { label: 'Media errors',      value: String(n.media_errors),        warn: n.media_errors > 0 },
                { label: 'Error log entries', value: String(n.num_err_log_entries), warn: n.num_err_log_entries > 0 },
                { label: 'Unsafe shutdowns',  value: String(n.unsafe_shutdowns),    warn: false },
                { label: 'Critical warning',  value: n.critical_warning === 0 ? 'None' : `0x${n.critical_warning.toString(16)}`, warn: n.critical_warning !== 0 },
              ] as m (m.label)}
                <div class="rounded-lg bg-secondary/50 px-3 py-2">
                  <p class={labelCls}>{m.label}</p>
                  <p class="text-[13px] font-medium tabular-nums {m.warn ? 'text-destructive' : ''}">{m.value}</p>
                </div>
              {/each}
            </div>
          </Card>
        {/if}

        <!-- ATA attribute table -->
        {#if smartData.ata_smart_attributes?.table}
          {@const table = smartData.ata_smart_attributes.table}
          {@const rows  = visibleAttrs(table)}
          <Card padding="none" class="overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2 border-b border-border">
              <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">SMART attributes</p>
              <Button variant="ghost" size="sm" class="text-xs text-primary" onclick={() => showAll = !showAll}>
                {showAll ? 'Show critical only' : `Show all ${table.length}`}
              </Button>
            </div>

            <div class="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-secondary/30 text-[11px] text-muted-foreground">
              <span class="w-6 shrink-0">#</span>
              <span class="flex-1">Attribute</span>
              <span class="w-8 text-right">Val</span>
              <span class="w-8 text-right">Wst</span>
              <span class="w-8 text-right">Thr</span>
              <span class="w-16 text-right">Raw</span>
            </div>

            <div class="divide-y divide-border">
              {#each rows as attr (attr.id)}
                {@const failed = attrFailed(attr)}
                <div class="flex items-center gap-3 px-4 py-2 {failed ? 'bg-destructive/5' : ''}">
                  <span class="text-[11px] text-muted-foreground tabular-nums w-6 shrink-0">{attr.id}</span>
                  <span class="text-xs font-mono flex-1 min-w-0 truncate {failed ? 'text-destructive font-medium' : ''}">
                    {attr.name}
                    {#if failed}<AlertTriangle size={10} class="inline ml-1 text-destructive" />{/if}
                  </span>
                  <span class="text-xs tabular-nums text-muted-foreground w-8 text-right">{attr.value}</span>
                  <span class="text-xs tabular-nums text-muted-foreground w-8 text-right">{attr.worst}</span>
                  <span class="text-xs tabular-nums text-muted-foreground w-8 text-right">{attr.thresh}</span>
                  <span class="text-xs tabular-nums font-medium w-16 text-right {failed ? 'text-destructive' : ''}">
                    {attr.raw.string || String(attr.raw.value)}
                  </span>
                </div>
              {/each}
              {#if rows.length === 0}
                <div class="px-4 py-6 text-center text-[13px] text-status-ok">
                  No concerning attributes — all critical indicators are zero
                </div>
              {/if}
            </div>
          </Card>
        {/if}
      {/if}
    {/if}
  </div>
</Page>
