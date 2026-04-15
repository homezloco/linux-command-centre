<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Globe, Server } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type HostPort = { host: string; port: number }
  type ProxyStatus = {
    mode: string; autoUrl: string; ignoreHosts: string[]
    http: HostPort; https: HostPort; socks: HostPort
  }

  let status  = $state<ProxyStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)
  let dirty   = $state(false)

  let mode        = $state('none')
  let autoUrl     = $state('')
  let httpHost    = $state(''); let httpPort  = $state(8080)
  let httpsHost   = $state(''); let httpsPort = $state(8080)
  let socksHost   = $state(''); let socksPort = $state(1080)
  let ignoreText  = $state('')  // comma/newline separated

  const MODES = [
    { value: 'none',   label: 'No proxy',   desc: 'Direct connection' },
    { value: 'manual', label: 'Manual',      desc: 'Configure host and port for each protocol' },
    { value: 'auto',   label: 'Automatic',   desc: 'Use a PAC configuration URL' },
  ]

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<ProxyStatus>('proxy:status')
      mode       = status.mode
      autoUrl    = status.autoUrl
      httpHost   = status.http.host;   httpPort  = status.http.port
      httpsHost  = status.https.host;  httpsPort = status.https.port
      socksHost  = status.socks.host;  socksPort = status.socks.port
      ignoreText = status.ignoreHosts.join(', ')
      dirty      = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      const ignoreHosts = ignoreText.split(/[,\n]+/).map(h => h.trim()).filter(Boolean)
      await invoke('proxy:set', {
        mode,
        ...(mode === 'auto'   ? { autoUrl } : {}),
        ...(mode === 'manual' ? {
          http:  { host: httpHost,  port: httpPort  },
          https: { host: httpsHost, port: httpsPort },
          socks: { host: socksHost, port: socksPort },
          ignoreHosts,
        } : {}),
      })
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  const mark = () => { dirty = true }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Mode picker -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Globe size={14} class="text-muted-foreground" /> Proxy Mode
      </p>
      <div class="space-y-2">
        {#each MODES as m}
          <button
            onclick={() => { mode = m.value; mark() }}
            class="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                   {mode === m.value ? 'border-primary/40 bg-primary/10' : 'border-border hover:bg-secondary/50'}"
          >
            <div class="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                        {mode === m.value ? 'border-primary' : 'border-muted-foreground'}">
              {#if mode === m.value}
                <div class="w-2 h-2 rounded-full bg-primary"></div>
              {/if}
            </div>
            <div>
              <p class="text-sm font-medium">{m.label}</p>
              <p class="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Auto PAC URL -->
    {#if mode === 'auto'}
      <div class="rounded-xl border border-border bg-card p-4 space-y-2">
        <label for="pac-url" class="text-sm font-medium">PAC Configuration URL</label>
        <input
          id="pac-url"
          bind:value={autoUrl}
          oninput={mark}
          placeholder="http://proxy.example.com/proxy.pac"
          class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    {/if}

    <!-- Manual fields -->
    {#if mode === 'manual'}
      <div class="rounded-xl border border-border bg-card p-4 space-y-4">
        <p class="text-sm font-medium flex items-center gap-2">
          <Server size={14} class="text-muted-foreground" /> Proxy Servers
        </p>

        {#snippet hostPortRow(label: string, bindHost: string, bindPort: number, setHost: (v: string) => void, setPort: (v: number) => void)}
          <div class="space-y-1.5">
            <p class="text-xs text-muted-foreground">{label}</p>
            <div class="flex gap-2">
              <input
                value={bindHost}
                oninput={(e) => { setHost((e.target as HTMLInputElement).value); mark() }}
                placeholder="hostname or IP"
                class="flex-1 rounded-md border border-border bg-secondary/50 px-3 py-1.5
                       text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number" min="1" max="65535"
                value={bindPort}
                oninput={(e) => { setPort(parseInt((e.target as HTMLInputElement).value) || 0); mark() }}
                placeholder="Port"
                class="w-20 rounded-md border border-border bg-secondary/50 px-3 py-1.5
                       text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        {/snippet}

        {@render hostPortRow('HTTP', httpHost, httpPort, v => httpHost = v, v => httpPort = v)}
        <div class="border-t border-border"></div>
        {@render hostPortRow('HTTPS', httpsHost, httpsPort, v => httpsHost = v, v => httpsPort = v)}
        <div class="border-t border-border"></div>
        {@render hostPortRow('SOCKS', socksHost, socksPort, v => socksHost = v, v => socksPort = v)}
      </div>

      <!-- Ignore hosts -->
      <div class="rounded-xl border border-border bg-card p-4 space-y-2">
        <label for="ignore-hosts" class="text-sm font-medium">Ignore Hosts</label>
        <p class="text-xs text-muted-foreground">Comma-separated list of hosts to bypass the proxy</p>
        <textarea
          id="ignore-hosts"
          bind:value={ignoreText}
          oninput={mark}
          rows={3}
          placeholder="localhost, 127.0.0.0/8, *.local"
          class="w-full rounded-md border border-border bg-secondary/50 px-3 py-2
                 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        ></textarea>
      </div>
    {/if}

    {#if error}
      <Alert message={error} />
    {/if}

    {#if dirty}
      <div class="flex gap-2">
        <button
          onclick={save}
          disabled={saving}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {#if saving}<RefreshCw size={12} class="animate-spin" />{/if}
          Apply
        </button>
        <button
          onclick={load}
          disabled={saving}
          class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80 disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    {/if}

  </div>
{/if}
