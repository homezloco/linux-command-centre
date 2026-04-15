<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Network, Wifi, Globe, RefreshCw, ArrowDown, ArrowUp, Server, CheckCircle2, XCircle } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type NetInterface = {
    name: string; state: string; type: string; mac: string | null
    ipv4: string | null; ipv6: string | null; isDefault: boolean
    rx: number; tx: number; rxPackets: number; txPackets: number
  }
  type NetworkStatus = {
    interfaces: NetInterface[]
    gateway: string | null
    dnsServers: string[]
  }
  type SpeedMap = Record<string, { rxBps: number; txBps: number }>

  let status = $state<NetworkStatus | null>(null)
  let speeds = $state<SpeedMap>({})
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let speedInterval: ReturnType<typeof setInterval> | undefined

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      status = await invoke<NetworkStatus>('network:status')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function refreshSpeed() {
    try { speeds = await invoke<SpeedMap>('network:speed') } catch { /* non-critical */ }
  }

  function fmt(bytes: number): string {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(2) + ' TB'
    if (bytes >= 1e9)  return (bytes / 1e9).toFixed(2) + ' GB'
    if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1) + ' MB'
    if (bytes >= 1e3)  return (bytes / 1e3).toFixed(1) + ' KB'
    return bytes + ' B'
  }

  function fmtSpeed(bps: number): string {
    if (bps >= 1e9)  return (bps / 1e9).toFixed(1) + ' GB/s'
    if (bps >= 1e6)  return (bps / 1e6).toFixed(1) + ' MB/s'
    if (bps >= 1e3)  return (bps / 1e3).toFixed(0) + ' KB/s'
    return bps + ' B/s'
  }

  function ifaceIcon(iface: NetInterface) {
    if (iface.name.startsWith('wl')) return Wifi
    if (iface.name.startsWith('lo')) return Server
    return Network
  }

  onMount(() => {
    load()
    refreshSpeed()
    speedInterval = setInterval(refreshSpeed, 1000)
  })
  onDestroy(() => clearInterval(speedInterval))
</script>

{#if loading}
  <Spinner />

{:else if error}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">Network Interfaces</h2>
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

    <!-- Interfaces -->
    {#each status.interfaces as iface}
      {@const Icon = ifaceIcon(iface)}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3
                  {iface.isDefault ? 'border-primary/30' : ''}">
        <!-- Header row -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg {iface.isDefault ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}">
              <Icon size={16} />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium">{iface.name}</p>
                {#if iface.isDefault}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">default</span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground">{iface.mac ?? 'no MAC'}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            {#if iface.state === 'up'}
              <CheckCircle2 size={14} class="text-green-400" />
              <span class="text-xs font-medium text-green-400">UP</span>
            {:else}
              <XCircle size={14} class="text-muted-foreground" />
              <span class="text-xs text-muted-foreground">{iface.state.toUpperCase()}</span>
            {/if}
          </div>
        </div>

        <!-- IP addresses -->
        {#if iface.ipv4 || iface.ipv6}
          <div class="grid grid-cols-2 gap-2 text-xs">
            {#if iface.ipv4}
              <div class="rounded-lg bg-secondary/50 p-2">
                <p class="text-muted-foreground mb-0.5">IPv4</p>
                <p class="font-mono font-medium">{iface.ipv4}</p>
              </div>
            {/if}
            {#if iface.ipv6}
              <div class="rounded-lg bg-secondary/50 p-2">
                <p class="text-muted-foreground mb-0.5">IPv6</p>
                <p class="font-mono font-medium truncate">{iface.ipv6}</p>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Traffic stats -->
        {#if iface.rx > 0 || iface.tx > 0}
          {@const spd = speeds[iface.name]}
          <div class="pt-1 border-t border-border space-y-1.5">
            <!-- Live speed -->
            {#if spd && (spd.rxBps > 0 || spd.txBps > 0)}
              <div class="flex gap-3 text-xs font-medium">
                <span class="flex items-center gap-1 text-green-400">
                  <ArrowDown size={11} />
                  {fmtSpeed(spd.rxBps)}
                </span>
                <span class="flex items-center gap-1 text-blue-400">
                  <ArrowUp size={11} />
                  {fmtSpeed(spd.txBps)}
                </span>
              </div>
            {/if}
            <!-- Cumulative -->
            <div class="flex gap-4 text-xs text-muted-foreground">
              <span class="flex items-center gap-1">
                <ArrowDown size={12} class="text-green-400/60" />
                {fmt(iface.rx)} total
              </span>
              <span class="flex items-center gap-1">
                <ArrowUp size={12} class="text-blue-400/60" />
                {fmt(iface.tx)} total
              </span>
              <span class="ml-auto">{iface.rxPackets.toLocaleString()} / {iface.txPackets.toLocaleString()} pkts</span>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <!-- Gateway & DNS -->
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground mb-2">
          <Globe size={13} />
          <span class="text-xs font-medium">Default Gateway</span>
        </div>
        {#if status.gateway}
          <p class="text-sm font-mono font-medium">{status.gateway}</p>
        {:else}
          <p class="text-xs text-muted-foreground">None</p>
        {/if}
      </div>
      <div class="rounded-xl border border-border bg-card p-3">
        <div class="flex items-center gap-2 text-muted-foreground mb-2">
          <Server size={13} />
          <span class="text-xs font-medium">DNS Servers</span>
        </div>
        {#if status.dnsServers.length > 0}
          {#each status.dnsServers as dns}
            <p class="text-xs font-mono">{dns}</p>
          {/each}
        {:else}
          <p class="text-xs text-muted-foreground">None found</p>
        {/if}
      </div>
    </div>

  </div>
{/if}
