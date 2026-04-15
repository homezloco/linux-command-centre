<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Globe, Plus, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type DnsLink = { index: string; name: string; dns: string[]; search: string[] }
  type DnsStatus = {
    resolvedActive: boolean
    globalDns: string[]; globalSearch: string[]
    links: DnsLink[]
    dnssecEnabled: boolean
    resolvConfRaw: string
  }

  let status  = $state<DnsStatus | null>(null)
  let loading = $state(true)
  let saving  = $state(false)
  let error   = $state('')
  let dirty   = $state(false)

  let dnsServers = $state<string[]>([])
  let searchDoms = $state<string[]>([])
  let newDns     = $state('')
  let newSearch  = $state('')
  let dnsErr     = $state('')

  const WELL_KNOWN = [
    { name: 'Google',       dns: ['8.8.8.8', '8.8.4.4'] },
    { name: 'Cloudflare',   dns: ['1.1.1.1', '1.0.0.1'] },
    { name: 'Quad9',        dns: ['9.9.9.9', '149.112.112.112'] },
    { name: 'OpenDNS',      dns: ['208.67.222.222', '208.67.220.220'] },
  ]

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<DnsStatus>('dns:status')
      dnsServers = [...status.globalDns]
      searchDoms = [...status.globalSearch]
      dirty = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  function addDns() {
    dnsErr = ''
    const v = newDns.trim()
    if (!v) return
    if (!/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(v)) { dnsErr = 'Invalid IP address'; return }
    if (dnsServers.includes(v)) { dnsErr = 'Already added'; return }
    dnsServers = [...dnsServers, v]
    newDns = ''; dirty = true
  }

  function removeDns(s: string) {
    dnsServers = dnsServers.filter(x => x !== s)
    dirty = true
  }

  function addSearch() {
    const v = newSearch.trim()
    if (!v || searchDoms.includes(v)) return
    searchDoms = [...searchDoms, v]
    newSearch = ''; dirty = true
  }

  function removeSearch(s: string) {
    searchDoms = searchDoms.filter(x => x !== s)
    dirty = true
  }

  function applyPreset(dns: string[]) {
    dnsServers = [...dns]
    dirty = true
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('dns:setGlobal', dnsServers, searchDoms)
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Status bar -->
    <div class="rounded-xl border border-border bg-card p-4 flex items-center gap-4 flex-wrap">
      <div class="flex items-center gap-2">
        {#if status.resolvedActive}
          <CheckCircle2 size={13} class="text-green-400" />
          <span class="text-xs text-muted-foreground">systemd-resolved active</span>
        {:else}
          <AlertTriangle size={13} class="text-yellow-400" />
          <span class="text-xs text-muted-foreground">systemd-resolved not detected — editing /etc/resolv.conf directly</span>
        {/if}
      </div>
      {#if status.dnssecEnabled}
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 font-medium">
          DNSSEC enabled
        </span>
      {/if}
      <button onclick={load} class="ml-auto p-1.5 rounded-md hover:bg-secondary text-muted-foreground" aria-label="Refresh">
        <RefreshCw size={13} />
      </button>
    </div>

    <!-- Quick presets -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-2">
      <p class="text-sm font-medium">Quick presets</p>
      <div class="grid grid-cols-2 gap-2">
        {#each WELL_KNOWN as p}
          <button
            onclick={() => applyPreset(p.dns)}
            class="flex items-center justify-between px-3 py-2 rounded-md border border-border
                   hover:bg-secondary/50 text-sm transition-colors text-left"
          >
            <span class="font-medium">{p.name}</span>
            <span class="text-xs text-muted-foreground font-mono">{p.dns[0]}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- DNS Servers -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Globe size={14} class="text-muted-foreground" /> DNS Servers
      </p>

      <div class="space-y-1.5">
        {#each dnsServers as s}
          <div class="flex items-center gap-2">
            <span class="flex-1 font-mono text-sm bg-secondary/50 rounded-md px-3 py-1.5 border border-border">{s}</span>
            <button
              onclick={() => removeDns(s)}
              class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
        {/each}

        {#if dnsServers.length === 0}
          <p class="text-xs text-muted-foreground italic">No DNS servers configured</p>
        {/if}
      </div>

      <div class="flex gap-2">
        <input
          bind:value={newDns}
          placeholder="e.g. 1.1.1.1"
          onkeydown={(e) => e.key === 'Enter' && addDns()}
          class="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm font-mono
                 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onclick={addDns}
          class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-secondary hover:bg-secondary/80 border border-border"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {#if dnsErr}<p class="text-xs text-destructive">{dnsErr}</p>{/if}
    </div>

    <!-- Search Domains -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Search Domains</p>
      <div class="space-y-1.5">
        {#each searchDoms as d}
          <div class="flex items-center gap-2">
            <span class="flex-1 font-mono text-sm bg-secondary/50 rounded-md px-3 py-1.5 border border-border">{d}</span>
            <button
              onclick={() => removeSearch(d)}
              class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
        {/each}
        {#if searchDoms.length === 0}
          <p class="text-xs text-muted-foreground italic">No search domains configured</p>
        {/if}
      </div>
      <div class="flex gap-2">
        <input
          bind:value={newSearch}
          placeholder="e.g. local.example.com"
          onkeydown={(e) => e.key === 'Enter' && addSearch()}
          class="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm font-mono
                 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onclick={addSearch}
          class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-secondary hover:bg-secondary/80 border border-border"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>

    <!-- Per-link DNS (read-only) -->
    {#if status.links.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">Per-interface DNS</p>
        <div class="space-y-2">
          {#each status.links as link}
            <div class="flex items-start justify-between text-xs">
              <span class="font-mono font-medium w-24 shrink-0 text-muted-foreground">{link.name}</span>
              <div class="flex-1 text-right space-y-0.5">
                {#each link.dns as s}
                  <p class="font-mono text-muted-foreground/70">{s}</p>
                {/each}
              </div>
            </div>
          {/each}
        </div>
        <p class="text-[10px] text-muted-foreground/50">Per-interface DNS is set by NetworkManager/DHCP</p>
      </div>
    {/if}

    {#if error}
      <Alert message={error} />
    {/if}

    {#if dirty}
      <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5 flex items-center gap-2 mb-2">
        <AlertTriangle size={13} class="text-yellow-400 shrink-0" />
        <p class="text-xs text-yellow-400">Unsaved changes — click Apply to write /etc/resolv.conf (requires authentication)</p>
      </div>
      <div class="flex gap-2">
        <button
          onclick={save}
          disabled={saving}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {#if saving}<RefreshCw size={12} class="animate-spin" />{:else}<Save size={12} />{/if}
          Apply
        </button>
        <button
          onclick={load}
          disabled={saving}
          class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    {/if}

  </div>
{/if}
