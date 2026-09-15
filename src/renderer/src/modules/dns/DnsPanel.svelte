<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button } from '$ui'
  import { toasts } from '$stores/toasts'
  import { RefreshCw, Globe, Plus, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type DnsLink = { index: string; name: string; dns: string[]; search: string[] }
  type DnsStatus = {
    resolvedActive: boolean
    globalDns: string[]; globalSearch: string[]
    links: DnsLink[]
    dnssecEnabled: boolean
    resolvConfRaw: string
  }

  const TITLE = 'DNS'
  const inputCls = 'flex-1 min-w-0 h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary'

  let status  = $state<DnsStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
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

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<DnsStatus>('dns:status')
      dnsServers = [...status.globalDns]
      searchDoms = [...status.globalSearch]
      dirty = false
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
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
    saving = true
    try {
      await invoke('dns:setGlobal', dnsServers, searchDoms)
      toasts.success('DNS settings applied', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { saving = false }
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload DNS settings"
      disabled={refreshing || loading || saving}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-12 w-full" />
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-40 w-full" />

    {:else if status}
      <!-- Status bar -->
      <Card padding="sm" class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2">
          {#if status.resolvedActive}
            <CheckCircle2 size={13} class="text-status-ok" />
            <span class="text-xs text-muted-foreground">systemd-resolved active</span>
          {:else}
            <AlertTriangle size={13} class="text-status-warn" />
            <span class="text-xs text-muted-foreground">systemd-resolved not detected — editing /etc/resolv.conf directly</span>
          {/if}
        </div>
        {#if status.dnssecEnabled}
          <span class="text-[11px] px-1.5 py-0.5 rounded bg-status-ok/10 border border-status-ok/30 text-status-ok font-medium">
            DNSSEC enabled
          </span>
        {/if}
      </Card>

      <!-- Quick presets -->
      <Card class="space-y-2">
        <p class="text-[13px] font-medium">Quick presets</p>
        <div class="grid grid-cols-2 gap-2">
          {#each WELL_KNOWN as p (p.name)}
            <Button variant="secondary" class="w-full justify-between" onclick={() => applyPreset(p.dns)}>
              <span class="font-medium">{p.name}</span>
              <span class="text-xs text-muted-foreground font-mono">{p.dns[0]}</span>
            </Button>
          {/each}
        </div>
      </Card>

      <!-- DNS Servers -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Globe size={14} class="text-muted-foreground" /> DNS Servers
        </p>

        <div class="space-y-1.5">
          {#each dnsServers as s, i (i)}
            <div class="flex items-center gap-2">
              <span class="flex-1 font-mono text-[13px] bg-secondary/50 rounded-md px-3 py-1.5 border border-border">{s}</span>
              <Button variant="icon" size="sm" aria-label="Remove {s}" class="hover:text-destructive" onclick={() => removeDns(s)}>
                <Trash2 size={13} />
              </Button>
            </div>
          {/each}

          {#if dnsServers.length === 0}
            <p class="text-xs text-muted-foreground italic">No DNS servers configured</p>
          {/if}
        </div>

        <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); addDns() }}>
          <input bind:value={newDns} placeholder="e.g. 1.1.1.1" aria-label="New DNS server" class={inputCls} />
          <Button type="submit" variant="secondary" size="sm">
            <Plus size={12} /> Add
          </Button>
        </form>
        {#if dnsErr}<p class="text-xs text-destructive">{dnsErr}</p>{/if}
      </Card>

      <!-- Search Domains -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium">Search Domains</p>
        <div class="space-y-1.5">
          {#each searchDoms as d, i (i)}
            <div class="flex items-center gap-2">
              <span class="flex-1 font-mono text-[13px] bg-secondary/50 rounded-md px-3 py-1.5 border border-border">{d}</span>
              <Button variant="icon" size="sm" aria-label="Remove {d}" class="hover:text-destructive" onclick={() => removeSearch(d)}>
                <Trash2 size={13} />
              </Button>
            </div>
          {/each}
          {#if searchDoms.length === 0}
            <p class="text-xs text-muted-foreground italic">No search domains configured</p>
          {/if}
        </div>
        <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); addSearch() }}>
          <input bind:value={newSearch} placeholder="e.g. local.example.com" aria-label="New search domain" class={inputCls} />
          <Button type="submit" variant="secondary" size="sm">
            <Plus size={12} /> Add
          </Button>
        </form>
      </Card>

      <!-- Per-link DNS (read-only) -->
      {#if status.links.length > 0}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">Per-interface DNS</p>
          <div class="space-y-2">
            {#each status.links as link, i (i)}
              <div class="flex items-start justify-between text-xs">
                <span class="font-mono font-medium w-24 shrink-0 text-muted-foreground">{link.name}</span>
                <div class="flex-1 text-right space-y-0.5">
                  {#each link.dns as s, j (j)}
                    <p class="font-mono text-muted-foreground">{s}</p>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
          <p class="text-[11px] text-muted-foreground">Per-interface DNS is set by NetworkManager/DHCP</p>
        </Card>
      {/if}

      {#if dirty}
        <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-2.5 flex items-center gap-2">
          <AlertTriangle size={13} class="text-status-warn shrink-0" />
          <p class="text-xs text-status-warn">Unsaved changes — click Apply to write /etc/resolv.conf (requires authentication)</p>
        </div>
        <div class="flex gap-2">
          <Button variant="primary" size="sm" loading={saving} onclick={save}>
            {#if !saving}<Save size={12} />{/if}
            Apply
          </Button>
          <Button variant="secondary" size="sm" disabled={saving} onclick={() => load(true)}>Reset</Button>
        </div>
      {/if}
    {/if}
  </div>
</Page>
