<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { HardDrive, Database, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Thermometer } from 'lucide-svelte'

  type Partition = {
    source: string; fstype: string; size: number; used: number; avail: number; pct: number; mount: string
  }
  type BlockDev = {
    name: string; size: string; type: string; vendor: string; model: string; mountpoint: string
  }
  type SmartHealth = {
    device: string; healthy: boolean | null; temperature: number | null
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
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

<!-- Error -->
{:else if error}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if status}
  <div class="space-y-5 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">Disks &amp; Partitions</h2>
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
               bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>

    <!-- Physical Disks -->
    {#if status.blockDevices.length > 0}
      <div class="space-y-2">
        {#each status.blockDevices as disk}
          {@const smart = smartForDev(disk.name)}
          <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-primary/10 text-primary">
                  <HardDrive size={16} />
                </div>
                <div>
                  <p class="text-sm font-medium">
                    {disk.vendor ? disk.vendor + ' ' : ''}{disk.model || disk.name}
                  </p>
                  <p class="text-xs text-muted-foreground">/dev/{disk.name} · {disk.size}</p>
                </div>
              </div>
              <!-- SMART health badge -->
              {#if smart}
                <div class="flex items-center gap-2 shrink-0">
                  {#if smart.temperature !== null}
                    <span class="flex items-center gap-1 text-xs text-muted-foreground">
                      <Thermometer size={12} />
                      {smart.temperature}°C
                    </span>
                  {/if}
                  {#if smart.healthy === true}
                    <span class="flex items-center gap-1 text-xs text-green-500 font-medium">
                      <CheckCircle2 size={13} />Healthy
                    </span>
                  {:else if smart.healthy === false}
                    <span class="flex items-center gap-1 text-xs text-red-500 font-medium">
                      <XCircle size={13} />FAILED
                    </span>
                  {:else}
                    <span class="text-xs text-muted-foreground">No SMART</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Partition Usage -->
    <div>
      <h2 class="text-sm font-medium text-muted-foreground mb-2">Partition Usage</h2>
      <div class="space-y-2">
        {#each status.partitions as p}
          <div class="rounded-xl border border-border bg-card p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-secondary text-muted-foreground">
                  <Database size={14} />
                </div>
                <div>
                  <p class="text-sm font-medium">{p.mount}</p>
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

  </div>
{/if}
