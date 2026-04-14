<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, HardDrive, AlertTriangle, CheckCircle2, XCircle } from 'lucide-svelte'

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

  let disks        = $state<Disk[]>([])
  let selected     = $state<string | null>(null)
  let smartData    = $state<SmartData | null>(null)
  let loading      = $state(true)
  let loadingSmart = $state(false)
  let error        = $state('')
  let smartError   = $state('')
  let showAll      = $state(false)

  // Critical attribute IDs — non-zero raw values indicate real problems
  const CRITICAL = new Set([5, 187, 188, 197, 198, 199])

  async function loadDisks() {
    loading = true; error = ''
    try {
      disks = await invoke<Disk[]>('smart:disks')
      if (disks.length > 0) selected = `/dev/${disks[0].name}`
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function loadSmart(device: string) {
    loadingSmart = true; smartError = ''; smartData = null
    try { smartData = await invoke<SmartData>('smart:info', device) }
    catch (e) { smartError = String(e) }
    finally { loadingSmart = false }
  }

  $effect(() => { if (selected) loadSmart(selected) })

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

  onMount(() => loadDisks())
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else if error}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if disks.length === 0}
  <div class="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
    No block devices found
  </div>

{:else}
  <div class="space-y-4 max-w-2xl">

    <!-- Disk selector tabs -->
    <div class="flex gap-2 flex-wrap">
      {#each disks as disk}
        <button
          onclick={() => selected = `/dev/${disk.name}`}
          class="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-sm
                 {selected === `/dev/${disk.name}`
                   ? 'border-primary bg-primary/10 text-primary'
                   : 'border-border bg-card text-muted-foreground hover:bg-secondary'}"
        >
          <HardDrive size={14} />
          <span class="font-mono">/dev/{disk.name}</span>
          {#if disk.model}<span class="text-xs opacity-70">· {disk.model}</span>{/if}
          <span class="text-xs opacity-50">{disk.size}</span>
        </button>
      {/each}
    </div>

    {#if loadingSmart}
      <div class="flex items-center justify-center h-40">
        <RefreshCw size={20} class="animate-spin text-muted-foreground" />
      </div>

    {:else if smartError}
      <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {smartError}
      </div>

    {:else if smartData}
      {@const passed   = smartData.smart_status?.passed ?? true}
      {@const protocol = smartData.device?.protocol || 'ATA'}
      {@const temp     = smartData.temperature?.current ?? smartData.nvme_smart_health_information_log?.temperature}
      {@const hours    = smartData.power_on_time?.hours ?? smartData.nvme_smart_health_information_log?.power_on_hours}

      <!-- Health banner -->
      <div class="rounded-xl border p-4 flex items-center gap-4
                  {passed ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/10'}">
        {#if passed}
          <CheckCircle2 size={28} class="text-green-400 shrink-0" />
        {:else}
          <XCircle size={28} class="text-destructive shrink-0" />
        {/if}
        <div class="flex-1 min-w-0">
          <p class="font-semibold {passed ? 'text-green-400' : 'text-destructive'}">
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
              <p class="text-[10px] text-muted-foreground">Temp</p>
              <p class="text-sm font-medium tabular-nums
                         {temp >= 60 ? 'text-destructive' : temp >= 45 ? 'text-yellow-400' : ''}">
                {temp}°C
              </p>
            </div>
          {/if}
          {#if hours != null}
            <div>
              <p class="text-[10px] text-muted-foreground">Power-on</p>
              <p class="text-sm font-medium tabular-nums">{formatHours(hours)}</p>
            </div>
          {/if}
          <div>
            <p class="text-[10px] text-muted-foreground">Protocol</p>
            <p class="text-sm font-medium">{protocol}</p>
          </div>
        </div>
      </div>

      <!-- NVMe metrics -->
      {#if smartData.nvme_smart_health_information_log}
        {@const n = smartData.nvme_smart_health_information_log}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">NVMe Health Log</p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {#each [
              { label: 'Available Spare',    value: `${n.available_spare}%`,    warn: n.available_spare < 10 },
              { label: 'Drive Usage',        value: `${n.percentage_used}%`,    warn: n.percentage_used > 90 },
              { label: 'Media Errors',       value: String(n.media_errors),     warn: n.media_errors > 0 },
              { label: 'Error Log Entries',  value: String(n.num_err_log_entries), warn: n.num_err_log_entries > 0 },
              { label: 'Unsafe Shutdowns',   value: String(n.unsafe_shutdowns), warn: false },
              { label: 'Critical Warning',   value: n.critical_warning === 0 ? 'None' : `0x${n.critical_warning.toString(16)}`, warn: n.critical_warning !== 0 },
            ] as m}
              <div class="rounded-lg bg-secondary/50 px-3 py-2">
                <p class="text-[10px] text-muted-foreground">{m.label}</p>
                <p class="text-sm font-medium tabular-nums {m.warn ? 'text-destructive' : ''}">{m.value}</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ATA attribute table -->
      {#if smartData.ata_smart_attributes?.table}
        {@const table   = smartData.ata_smart_attributes.table}
        {@const visible = visibleAttrs(table)}
        <div class="rounded-xl border border-border bg-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SMART Attributes</p>
            <button
              onclick={() => showAll = !showAll}
              class="text-xs text-primary hover:underline"
            >
              {showAll ? 'Show critical only' : `Show all ${table.length}`}
            </button>
          </div>

          <!-- Column headers -->
          <div class="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-secondary/30">
            <span class="text-[10px] text-muted-foreground/50 w-6 shrink-0">#</span>
            <span class="text-[10px] text-muted-foreground flex-1">Attribute</span>
            <span class="text-[10px] text-muted-foreground w-8 text-right">Val</span>
            <span class="text-[10px] text-muted-foreground w-8 text-right">Wst</span>
            <span class="text-[10px] text-muted-foreground w-8 text-right">Thr</span>
            <span class="text-[10px] text-muted-foreground w-16 text-right">Raw</span>
          </div>

          <div class="divide-y divide-border">
            {#each visible as attr}
              {@const failed = attrFailed(attr)}
              <div class="flex items-center gap-3 px-4 py-2 {failed ? 'bg-destructive/5' : ''}">
                <span class="text-[10px] text-muted-foreground/50 tabular-nums w-6 shrink-0">{attr.id}</span>
                <span class="text-xs font-mono flex-1 min-w-0 truncate {failed ? 'text-destructive font-medium' : ''}">
                  {attr.name}
                  {#if failed}<AlertTriangle size={10} class="inline ml-1 text-destructive" />{/if}
                </span>
                <span class="text-xs tabular-nums text-muted-foreground w-8 text-right">{attr.value}</span>
                <span class="text-xs tabular-nums text-muted-foreground/50 w-8 text-right">{attr.worst}</span>
                <span class="text-xs tabular-nums text-muted-foreground/50 w-8 text-right">{attr.thresh}</span>
                <span class="text-xs tabular-nums font-medium w-16 text-right {failed ? 'text-destructive' : ''}">
                  {attr.raw.string || String(attr.raw.value)}
                </span>
              </div>
            {/each}
            {#if visible.length === 0}
              <div class="px-4 py-6 text-center text-sm text-green-400">
                No concerning attributes — all critical indicators are zero
              </div>
            {/if}
          </div>
        </div>
      {/if}

    {/if}
  </div>
{/if}
