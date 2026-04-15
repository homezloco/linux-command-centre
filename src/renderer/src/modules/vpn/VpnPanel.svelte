<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, ShieldCheck, ShieldOff, Wifi, Lock } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type VpnConn = { name: string; type: string; active: boolean; device: string | null }

  let connections = $state<VpnConn[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')
  let toggling = $state<string | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    else loading = true
    error = ''
    try {
      connections = await invoke<VpnConn[]>('vpn:list')
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function toggle(conn: VpnConn) {
    toggling = conn.name
    error = ''
    try {
      if (conn.active) {
        await invoke('vpn:disconnect', conn.name)
      } else {
        await invoke('vpn:connect', conn.name)
      }
      await load(true)
    } catch (e) { error = String(e) }
    finally { toggling = null }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else}
  <div class="space-y-4 max-w-2xl">

    <div class="flex items-center justify-end">
      <button
        onclick={() => load(true)}
        disabled={refreshing}
        aria-label="Refresh"
        class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
      </button>
    </div>

    {#if error}<Alert message={error} />{/if}

    {#if connections.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-2">
        <Lock size={24} class="mx-auto text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No VPN connections configured</p>
        <p class="text-xs text-muted-foreground/60">
          Add a VPN connection via GNOME Settings → Network → VPN
        </p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each connections as conn}
          <div class="rounded-xl border bg-card p-4 flex items-center gap-3
                      {conn.active ? 'border-green-500/30' : 'border-border'}">

            <!-- Icon -->
            <div class="p-2.5 rounded-lg shrink-0
                        {conn.active ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground'}">
              {#if conn.active}
                <ShieldCheck size={18} />
              {:else}
                <ShieldOff size={18} />
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">{conn.name}</p>
                {#if conn.active}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">
                    Connected
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground">
                {conn.type === 'wireguard' ? 'WireGuard' : 'VPN'}
                {#if conn.device && conn.active}
                  · {conn.device}
                {/if}
              </p>
            </div>

            <!-- Toggle -->
            {#if toggling === conn.name}
              <RefreshCw size={16} class="animate-spin text-muted-foreground shrink-0" />
            {:else}
              <button
                onclick={() => toggle(conn)}
                aria-label="{conn.active ? 'Disconnect' : 'Connect'} {conn.name}"
                class="relative w-11 h-6 rounded-full transition-colors shrink-0
                       {conn.active ? 'bg-green-500' : 'bg-secondary border border-border'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow
                             transition-transform {conn.active ? 'translate-x-5' : ''}"></span>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <p class="text-xs text-muted-foreground">
      Connections are managed by NetworkManager.
      Add or configure VPNs in <span class="font-medium">Settings → Network → VPN</span>.
    </p>
  </div>
{/if}
