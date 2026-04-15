<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Plus, Trash2, EyeOff, Eye, AlertTriangle, Save } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type HostEntry = {
    id: string; ip: string; hostname: string; aliases: string
    enabled: boolean; system: boolean; raw: string
  }

  let raw     = $state('')
  let entries = $state<HostEntry[]>([])
  let loading = $state(true)
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

  async function load() {
    loading = true; error = ''
    try {
      raw = await invoke<string>('hosts:read')
      entries = parseHosts(raw)
      dirty = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('hosts:write', buildContent())
      await load()
    } catch (e) { error = String(e) }
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

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else}
  <div class="space-y-4 max-w-2xl">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">{entries.length} entries</h2>
      <div class="flex gap-2">
        <button
          onclick={() => { showAdd = !showAdd; addError = '' }}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={12} /> Add Entry
        </button>
        {#if dirty}
          <button
            onclick={save}
            disabled={saving}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                   bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          >
            {#if saving}<RefreshCw size={12} class="animate-spin" />{:else}<Save size={12} />{/if}
            Save
          </button>
        {/if}
      </div>
    </div>

    <!-- Add form -->
    {#if showAdd}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">New entry</p>
        <div class="grid grid-cols-3 gap-2">
          <input bind:value={newIp}       placeholder="IP address"  class="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <input bind:value={newHostname} placeholder="hostname"    class="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <input bind:value={newAliases}  placeholder="aliases (optional)" class="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        {#if addError}<p class="text-xs text-destructive">{addError}</p>{/if}
        <div class="flex gap-2">
          <button onclick={addEntry} class="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Add</button>
          <button onclick={() => showAdd = false} class="px-3 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80">Cancel</button>
        </div>
      </div>
    {/if}

    {#if dirty}
      <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5 flex items-center gap-2">
        <AlertTriangle size={13} class="text-yellow-400 shrink-0" />
        <p class="text-xs text-yellow-400">Unsaved changes — click Save to write /etc/hosts (requires authentication)</p>
      </div>
    {/if}

    {#if error}
      <Alert message={error} />
    {/if}

    <!-- Entries -->
    <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {#each entries as entry}
        <div class="flex items-center gap-3 px-4 py-2.5 {entry.enabled ? '' : 'opacity-50'}">
          <span class="font-mono text-xs w-32 shrink-0 {entry.system ? 'text-muted-foreground' : ''}">{entry.ip}</span>
          <div class="flex-1 min-w-0">
            <span class="font-mono text-sm font-medium">{entry.hostname}</span>
            {#if entry.aliases}
              <span class="text-xs text-muted-foreground ml-2">{entry.aliases}</span>
            {/if}
          </div>
          {#if entry.system}
            <span class="text-[10px] text-muted-foreground/50">system</span>
          {:else}
            <button
              onclick={() => toggleEntry(entry.id)}
              aria-label="{entry.enabled ? 'Disable' : 'Enable'} entry"
              title="{entry.enabled ? 'Disable' : 'Enable'}"
              class="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
            >
              {#if entry.enabled}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
            </button>
            <button
              onclick={() => removeEntry(entry.id)}
              aria-label="Remove entry"
              class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          {/if}
        </div>
      {/each}

      {#if entries.length === 0}
        <div class="px-4 py-6 text-center text-sm text-muted-foreground">No host entries found</div>
      {/if}
    </div>

  </div>
{/if}
