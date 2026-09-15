<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Page, Card, Skeleton, Button } from '$ui'
  import { toasts } from '$stores/toasts'
  import { RefreshCw, Plus, Trash2, EyeOff, Eye, AlertTriangle, Save } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type HostEntry = {
    id: string; ip: string; hostname: string; aliases: string
    enabled: boolean; system: boolean; raw: string
  }

  const TITLE = 'Hosts'
  const inputCls = 'h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary'

  let raw     = $state('')
  let entries = $state<HostEntry[]>([])
  let loading = $state(true)
  let refreshing = $state(false)
  let saving  = $state(false)
  let error   = $state('')
  let dirty   = $state(false)

  // Add form
  let newIp       = $state('')
  let newHostname = $state('')
  let newAliases  = $state('')
  let addError    = $state('')
  let showAdd     = $state(false)

  const SYSTEM_IPS = ['127.0.0.1', '127.0.1.1', '::1', 'fe00::0', 'ff00::0', 'ff02::1', 'ff02::2', 'ff02::3']

  function parseHosts(content: string): HostEntry[] {
    const result: HostEntry[] = []
    let i = 0
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const isComment = trimmed.startsWith('#')
      // Try to detect disabled entries (commented-out host lines)
      const active = isComment
        ? trimmed.replace(/^#+\s*/, '')
        : trimmed

      const m = active.match(/^(\S+)\s+(\S+)((?:\s+\S+)*)/)
      if (!m && isComment && !active.match(/^(\S+)\s+(\S+)/)) {
        // Pure comment — skip (keep in raw but don't show)
        i++; continue
      }
      if (!m) { i++; continue }

      const [, ip, hostname, rest] = m
      const isIp = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(ip)
      if (!isIp) { i++; continue }

      result.push({
        id: `h${i}`,
        ip,
        hostname,
        aliases: rest?.trim() || '',
        enabled: !isComment,
        system: SYSTEM_IPS.includes(ip),
        raw: line,
      })
      i++
    }
    return result
  }

  function buildContent(): string {
    const lines: string[] = []
    // Reconstruct: keep all existing lines but replace the ones we track
    const original = raw.split('\n')
    const tracked = new Set(entries.map(e => e.raw))

    for (const line of original) {
      if (!tracked.has(line)) {
        lines.push(line); continue
      }
      // Find matching entry
      const entry = entries.find(e => e.raw === line)
      if (!entry) { lines.push(line); continue }
      const hostLine = `${entry.ip}\t${entry.hostname}${entry.aliases ? ' ' + entry.aliases : ''}`
      lines.push(entry.enabled ? hostLine : `# ${hostLine}`)
    }
    return lines.join('\n')
  }

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      raw = await invoke<string>('hosts:read')
      entries = parseHosts(raw)
      dirty = false
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function save() {
    saving = true
    try {
      await invoke('hosts:write', buildContent())
      toasts.success('/etc/hosts saved', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { saving = false }
  }

  function toggleEntry(id: string) {
    entries = entries.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e)
    dirty = true
  }

  function removeEntry(id: string) {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    // Remove from raw too so buildContent() won't include it
    raw = raw.split('\n').filter(l => l !== entry.raw).join('\n')
    entries = entries.filter(e => e.id !== id)
    dirty = true
  }

  function addEntry() {
    addError = ''
    if (!newIp || !newHostname) { addError = 'IP and hostname are required'; return }
    if (!/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(newIp)) { addError = 'Invalid IP address'; return }
    if (!/^[a-zA-Z0-9._-]+$/.test(newHostname)) { addError = 'Invalid hostname'; return }

    const line = `${newIp}\t${newHostname}${newAliases ? ' ' + newAliases : ''}`
    const id = `h${Date.now()}`
    entries = [...entries, {
      id, ip: newIp, hostname: newHostname, aliases: newAliases,
      enabled: true, system: false, raw: line
    }]
    raw = raw.trimEnd() + '\n' + line + '\n'
    newIp = ''; newHostname = ''; newAliases = ''; showAdd = false
    dirty = true
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="secondary"
      size="sm"
      disabled={loading}
      onclick={() => { showAdd = !showAdd; addError = '' }}
    >
      <Plus size={12} /> Add Entry
    </Button>
    {#if dirty}
      <Button variant="primary" size="sm" loading={saving} onclick={save}>
        {#if !saving}<Save size={12} />{/if}
        Save
      </Button>
    {/if}
    <Button
      variant="icon"
      size="sm"
      aria-label={dirty ? 'Discard changes and reload' : 'Reload /etc/hosts'}
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
      <Skeleton class="h-3 w-24" />
      <Card padding="none">
        {#each [0, 1, 2, 3, 4] as i (i)}
          <div class="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 last:border-0">
            <Skeleton class="h-3 w-28 shrink-0" />
            <Skeleton class="h-3 w-40" />
          </div>
        {/each}
      </Card>

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</h2>

      <!-- Add form -->
      {#if showAdd}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">New entry</p>
          <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); addEntry() }}>
            <div class="grid grid-cols-3 gap-2">
              <input bind:value={newIp}       placeholder="IP address"         aria-label="IP address" class={inputCls} />
              <input bind:value={newHostname} placeholder="hostname"           aria-label="Hostname"   class={inputCls} />
              <input bind:value={newAliases}  placeholder="aliases (optional)" aria-label="Aliases"    class={inputCls} />
            </div>
            {#if addError}<p class="text-xs text-destructive">{addError}</p>{/if}
            <div class="flex gap-2">
              <Button type="submit" variant="primary" size="sm">Add</Button>
              <Button variant="secondary" size="sm" onclick={() => { showAdd = false }}>Cancel</Button>
            </div>
          </form>
        </Card>
      {/if}

      {#if dirty}
        <div class="rounded-lg bg-status-warn/10 border border-status-warn/30 p-2.5 flex items-center gap-2">
          <AlertTriangle size={13} class="text-status-warn shrink-0" />
          <p class="text-xs text-status-warn">Unsaved changes — click Save to write /etc/hosts (requires authentication)</p>
        </div>
      {/if}

      <!-- Entries -->
      <Card padding="none" class="divide-y divide-border overflow-hidden">
        {#each entries as entry (entry.id)}
          <div class="flex items-center gap-3 px-4 py-2 {entry.enabled ? '' : 'opacity-50'}">
            <span class="font-mono text-xs w-32 shrink-0 truncate {entry.system ? 'text-muted-foreground' : ''}">{entry.ip}</span>
            <div class="flex-1 min-w-0 truncate">
              <span class="font-mono text-[13px] font-medium">{entry.hostname}</span>
              {#if entry.aliases}
                <span class="text-xs text-muted-foreground ml-2">{entry.aliases}</span>
              {/if}
            </div>
            {#if entry.system}
              <span class="text-[11px] text-muted-foreground">system</span>
            {:else}
              <Button
                variant="icon"
                size="sm"
                aria-label="{entry.enabled ? 'Disable' : 'Enable'} {entry.hostname}"
                onclick={() => toggleEntry(entry.id)}
              >
                {#if entry.enabled}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
              </Button>
              <Button
                variant="icon"
                size="sm"
                aria-label="Remove {entry.hostname}"
                class="hover:text-destructive"
                onclick={() => removeEntry(entry.id)}
              >
                <Trash2 size={13} />
              </Button>
            {/if}
          </div>
        {/each}

        {#if entries.length === 0}
          <div class="px-4 py-6 text-center text-[13px] text-muted-foreground">No host entries found</div>
        {/if}
      </Card>
    {/if}
  </div>
</Page>
