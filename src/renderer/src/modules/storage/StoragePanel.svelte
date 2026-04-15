<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { HardDrive, Database, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Thermometer } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

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

  let status = $state<StorageStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
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
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 75) return 'bg-yellow-500'
    return 'bg-primary'
  }

  function smartForDev(name: string) {
    return status?.smart.find(s => s.device === name) ?? null
  }

  onMount(() => load())
</script>

<!-- Loading -->
{#if loading}
  <Spinner />

<!-- Error -->
{:else if error}
  <Alert message={error} />

{:else if status}
  <div class="space-y-5 max-w-2xl">

    <!-- Refresh -->
    <div class="flex justify-end">
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        aria-label="Refresh"
        class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>

    <!-- Physical Disks -->
    {#if status.blockDevices.length > 0}
      <div class="space-y-3">
        {#each status.blockDevices as disk}
          {@const smart = smartForDev(disk.name)}
          <div class="rounded-xl border border-border bg-card p-4 space-y-3">
            <!-- Disk header -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-md bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                  <HardDrive size={15} />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium leading-tight">
                    {disk.vendor ? disk.vendor + ' ' : ''}{disk.model || disk.name}
                  </p>
                  <p class="text-xs text-muted-foreground">/dev/{disk.name} · {disk.size}</p>
                </div>
              </div>
              <!-- Health badge -->
              {#if smart}
                <div class="flex items-center gap-2 shrink-0">
                  {#if smart.healthy === true}
                    <span class="flex items-center gap-1 text-xs text-green-400 font-medium">
                      <CheckCircle2 size={12} />Healthy
                    </span>
                  {:else if smart.healthy === false}
                    <span class="flex items-center gap-1 text-xs text-red-400 font-medium">
                      <XCircle size={12} />FAILED
                    </span>
                  {:else}
                    <span class="text-xs text-muted-foreground">No SMART</span>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- SMART stats grid -->
            {#if smart}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {#if smart.temperature !== null}
                  <div class="rounded-md bg-secondary/30 px-2.5 py-1.5 flex items-center justify-between">
                    <span class="text-muted-foreground flex items-center gap-1">
                      <Thermometer size={10} /> Temp
                    </span>
                    <span class="font-medium">{smart.temperature}°C</span>
                  </div>
                {/if}
                {#if smart.powerOnHours !== null}
                  <div class="rounded-md bg-secondary/30 px-2.5 py-1.5 flex items-center justify-between">
                    <span class="text-muted-foreground">Hours</span>
                    <span class="font-medium">{(smart.powerOnHours / 24 / 365).toFixed(1)}y</span>
                  </div>
                {/if}
                {#if smart.wearLevel !== null}
                  <div class="rounded-md bg-secondary/30 px-2.5 py-1.5 flex items-center justify-between">
                    <span class="text-muted-foreground">Wear</span>
                    <span class="font-medium {smart.wearLevel > 80 ? 'text-yellow-400' : ''}">{smart.wearLevel}%</span>
                  </div>
                {/if}
                {#if smart.pendingSectors !== null && smart.pendingSectors > 0}
                  <div class="rounded-md bg-red-400/10 px-2.5 py-1.5 flex items-center justify-between">
                    <span class="text-red-400">Pending</span>
                    <span class="font-medium text-red-400">{smart.pendingSectors}</span>
                  </div>
                {/if}
              </div>

              <!-- I/O Activity -->
              {#if smart.readMBps > 0 || smart.writeMBps > 0 || smart.utilPct > 0}
                <div class="flex items-center gap-3 text-xs pt-1">
                  <div class="flex items-center gap-1.5">
                    <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
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
          </div>
        {/each}
      </div>
    {/if}

    <!-- Partition Usage -->
    <div class="space-y-3">
      {#each status.partitions as p}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-7 h-7 rounded-md bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                <Database size={13} />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium leading-tight">{p.mount}</p>
                <p class="text-xs text-muted-foreground">{p.source} · {p.fstype}</p>
              </div>
            </div>
            <div class="text-right shrink-0">
              <p class="text-sm font-medium">{p.pct}%</p>
              <p class="text-xs text-muted-foreground">{fmt(p.used)} / {fmt(p.size)}</p>
            </div>
          </div>
          <!-- Usage bar -->
          <div class="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              class="h-full rounded-full transition-all {barColor(p.pct)}"
              style="width: {p.pct}%"
            ></div>
          </div>
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{fmt(p.used)} used</span>
            <span>{fmt(p.avail)} free</span>
          </div>
        </div>
      {/each}
    </div>

  </div>
{/if}
