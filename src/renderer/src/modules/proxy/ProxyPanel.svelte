<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button } from '$ui'
  import { toasts } from '$stores/toasts'
  import { RefreshCw, Globe, Server, AlertTriangle } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type HostPort = { host: string; port: number }
  type ProxyStatus = {
    mode: string; autoUrl: string; ignoreHosts: string[]
    http: HostPort; https: HostPort; socks: HostPort
  }

  const TITLE = 'Proxy'
  const inputCls = 'h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'

  let status  = $state<ProxyStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
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

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
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
    finally { loading = false; refreshing = false }
  }

  async function save() {
    saving = true
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
      toasts.success('Proxy settings applied', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { saving = false }
  }

  const mark = () => { dirty = true }

  onMount(() => { void load() })
</script>

{#snippet hostPortRow(label: string, bindHost: string, bindPort: number, setHost: (v: string) => void, setPort: (v: number) => void)}
  <div class="space-y-1.5">
    <p class="text-xs text-muted-foreground">{label}</p>
    <div class="flex gap-2">
      <input
        value={bindHost}
        aria-label="{label} proxy host"
        oninput={(e) => { setHost((e.target as HTMLInputElement).value); mark() }}
        placeholder="hostname or IP"
        class="{inputCls} flex-1 min-w-0"
      />
      <input
        type="number" min="1" max="65535"
        value={bindPort}
        aria-label="{label} proxy port"
        oninput={(e) => { setPort(parseInt((e.target as HTMLInputElement).value) || 0); mark() }}
        placeholder="Port"
        class="{inputCls} w-20"
      />
    </div>
  </div>
{/snippet}

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload proxy settings"
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
      <Skeleton class="h-56 w-full" />
      <Skeleton class="h-20 w-full" />

    {:else if status}
      <!-- Mode picker -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2" id="proxy-mode-label">
          <Globe size={14} class="text-muted-foreground" /> Proxy Mode
        </p>
        <div class="space-y-2" role="radiogroup" aria-labelledby="proxy-mode-label">
          {#each MODES as m (m.value)}
            <button
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onclick={() => { mode = m.value; mark() }}
              class="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                     {mode === m.value ? 'border-primary/40 bg-primary/10' : 'border-border hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'}"
            >
              <div class="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                          {mode === m.value ? 'border-primary' : 'border-muted-foreground'}" aria-hidden="true">
                {#if mode === m.value}
                  <div class="w-2 h-2 rounded-full bg-primary"></div>
                {/if}
              </div>
              <div>
                <p class="text-[13px] font-medium">{m.label}</p>
                <p class="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </button>
          {/each}
        </div>
      </Card>

      <!-- Auto PAC URL -->
      {#if mode === 'auto'}
        <Card class="space-y-2">
          <label for="pac-url" class="text-[13px] font-medium">PAC Configuration URL</label>
          <input
            id="pac-url"
            bind:value={autoUrl}
            oninput={mark}
            placeholder="http://proxy.example.com/proxy.pac"
            class="{inputCls} w-full"
          />
        </Card>
      {/if}

      <!-- Manual fields -->
      {#if mode === 'manual'}
        <Card class="space-y-4">
          <p class="text-[13px] font-medium flex items-center gap-2">
            <Server size={14} class="text-muted-foreground" /> Proxy Servers
          </p>

          {@render hostPortRow('HTTP', httpHost, httpPort, v => httpHost = v, v => httpPort = v)}
          <div class="border-t border-border"></div>
          {@render hostPortRow('HTTPS', httpsHost, httpsPort, v => httpsHost = v, v => httpsPort = v)}
          <div class="border-t border-border"></div>
          {@render hostPortRow('SOCKS', socksHost, socksPort, v => socksHost = v, v => socksPort = v)}
        </Card>

        <!-- Ignore hosts -->
        <Card class="space-y-2">
          <label for="ignore-hosts" class="text-[13px] font-medium">Ignore Hosts</label>
          <p class="text-xs text-muted-foreground">Comma-separated list of hosts to bypass the proxy</p>
          <textarea
            id="ignore-hosts"
            bind:value={ignoreText}
            oninput={mark}
            rows={3}
            placeholder="localhost, 127.0.0.0/8, *.local"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-2
                   text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          ></textarea>
        </Card>
      {/if}

      {#if dirty}
        <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-2.5 flex items-center gap-2">
          <AlertTriangle size={13} class="text-status-warn shrink-0" />
          <p class="text-xs text-status-warn">Unsaved changes — click Apply to update the desktop proxy settings</p>
        </div>
        <div class="flex gap-2">
          <Button variant="primary" size="sm" loading={saving} onclick={save}>Apply</Button>
          <Button variant="secondary" size="sm" disabled={saving} onclick={() => load(true)}>Reset</Button>
        </div>
      {/if}
    {/if}
  </div>
</Page>
