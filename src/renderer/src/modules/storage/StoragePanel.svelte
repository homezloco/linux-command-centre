<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button, EmptyState } from '$ui'
  import { HardDrive, Database, RefreshCw, CheckCircle2, XCircle, Thermometer } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type Partition = {
    source: string; fstype: string; size: number; used: number; avail: number; pct: number; mount: string
  }
  type BlockDev = {
    name: string; size: string; type: string; vendor: string; model: string; mountpoint: string
  }
  type SmartHealth = {
    device: string
    healthy: boolean | null
    temperature: number | null
    powerOnHours: number | null
    wearLevel: number | null
    pendingSectors: number | null
    readMBps: number
    writeMBps: number
    utilPct: number
  }
  type StorageStatus = {
    partitions: Partition[]
    blockDevices: BlockDev[]
    smart: SmartHealth[]
  }

  const statCls = 'rounded-md bg-secondary/30 px-2.5 py-1.5 flex items-center justify-between'

  let status = $state<StorageStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<StorageStatus>('storage:status')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
    if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }

  function barColor(pct: number): string {
    if (pct >= 90) return 'bg-status-fail'
    if (pct >= 75) return 'bg-status-warn'
    return 'bg-primary'
  }

  function smartForDev(name: string) {
    return status?.smart.find(s => s.device === name) ?? null
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh storage"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-5">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-24 w-full" />

    {:else if status}
      <!-- Physical disks -->
      {#if status.blockDevices.length > 0}
        <div class="space-y-3">
          {#each status.blockDevices as disk (disk.name)}
            {@const smart = smartForDev(disk.name)}
            <Card class="space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-8 h-8 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                    <HardDrive size={15} />
                  </div>
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium leading-tight truncate">
                      {disk.vendor ? disk.vendor + ' ' : ''}{disk.model || disk.name}
                    </p>
                    <p class="text-xs text-muted-foreground">/dev/{disk.name} · {disk.size}</p>
                  </div>
                </div>
                {#if smart}
                  <div class="flex items-center gap-2 shrink-0">
                    {#if smart.healthy === true}
                      <span class="flex items-center gap-1 text-xs text-status-ok font-medium">
                        <CheckCircle2 size={12} />Healthy
                      </span>
                    {:else if smart.healthy === false}
                      <span class="flex items-center gap-1 text-xs text-status-fail font-medium">
                        <XCircle size={12} />FAILED
                      </span>
                    {:else}
                      <span class="text-xs text-muted-foreground">No SMART</span>
                    {/if}
                  </div>
                {/if}
              </div>

              {#if smart}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {#if smart.temperature !== null}
                    <div class={statCls}>
                      <span class="text-muted-foreground flex items-center gap-1">
                        <Thermometer size={10} /> Temp
                      </span>
                      <span class="font-medium tabular-nums">{smart.temperature}°C</span>
                    </div>
                  {/if}
                  {#if smart.powerOnHours !== null}
                    <div class={statCls}>
                      <span class="text-muted-foreground">Hours</span>
                      <span class="font-medium tabular-nums">{(smart.powerOnHours / 24 / 365).toFixed(1)}y</span>
                    </div>
                  {/if}
                  {#if smart.wearLevel !== null}
                    <div class={statCls}>
                      <span class="text-muted-foreground">Wear</span>
                      <span class="font-medium tabular-nums {smart.wearLevel > 80 ? 'text-status-warn' : ''}">{smart.wearLevel}%</span>
                    </div>
                  {/if}
                  {#if smart.pendingSectors !== null && smart.pendingSectors > 0}
                    <div class="rounded-md bg-status-fail/10 px-2.5 py-1.5 flex items-center justify-between">
                      <span class="text-status-fail">Pending</span>
                      <span class="font-medium text-status-fail tabular-nums">{smart.pendingSectors}</span>
                    </div>
                  {/if}
                </div>

                {#if smart.readMBps > 0 || smart.writeMBps > 0 || smart.utilPct > 0}
                  <div class="flex items-center gap-3 text-xs pt-1 tabular-nums">
                    <div class="flex items-center gap-1.5">
                      <div class="w-2 h-2 rounded-full bg-status-ok motion-safe:animate-pulse"></div>
                      <span class="text-muted-foreground">Active</span>
                    </div>
                    <span class="text-muted-foreground">·</span>
                    <span class="text-muted-foreground">R: <span class="text-foreground font-medium">{smart.readMBps.toFixed(1)} MB/s</span></span>
                    <span class="text-muted-foreground">W: <span class="text-foreground font-medium">{smart.writeMBps.toFixed(1)} MB/s</span></span>
                    <span class="text-muted-foreground">·</span>
                    <span class="text-muted-foreground">Util: <span class="text-foreground font-medium">{smart.utilPct}%</span></span>
                  </div>
                {/if}
              {/if}
            </Card>
          {/each}
        </div>
      {:else}
        <EmptyState icon={HardDrive} title="No physical disks detected" message="Partition usage is shown below." />
      {/if}

      <!-- Partition usage -->
      <div class="space-y-3">
        {#if status.partitions.length === 0}
          <EmptyState icon={Database} title="No partitions found" message="No mounted filesystems were reported." />
        {/if}
        {#each status.partitions as p (`${p.source}:${p.mount}`)}
          <Card class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-7 h-7 rounded-md bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                  <Database size={13} />
                </div>
                <div class="min-w-0">
                  <p class="text-[13px] font-medium leading-tight truncate">{p.mount}</p>
                  <p class="text-xs text-muted-foreground truncate">{p.source} · {p.fstype}</p>
                </div>
              </div>
              <div class="text-right shrink-0 tabular-nums">
                <p class="text-[13px] font-medium">{p.pct}%</p>
                <p class="text-xs text-muted-foreground">{fmt(p.used)} / {fmt(p.size)}</p>
              </div>
            </div>
            <div class="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div class="h-full rounded-full transition-all {barColor(p.pct)}" style="width: {p.pct}%"></div>
            </div>
            <div class="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{fmt(p.used)} used</span>
              <span>{fmt(p.avail)} free</span>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</Page>
