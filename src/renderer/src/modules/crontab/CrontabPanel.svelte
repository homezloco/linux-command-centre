<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Plus, Trash2, Eye, EyeOff, Save, Clock, AlertTriangle } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type CronJob = {
    id: string
    enabled: boolean
    minute: string; hour: string; dom: string; month: string; dow: string
    command: string
    raw: string
    humanSchedule: string
  }

  let jobs    = $state<CronJob[]>([])
  let rawText = $state('')
  let loading = $state(true)
  let saving  = $state(false)
  let error   = $state('')
  let dirty   = $state(false)

  // Add form
  let showAdd     = $state(false)
  let addMinute   = $state('0')
  let addHour     = $state('*')
  let addDom      = $state('*')
  let addMonth    = $state('*')
  let addDow      = $state('*')
  let addCommand  = $state('')
  let addError    = $state('')
  let addPreset   = $state('')

  const PRESETS = [
    { label: 'Every minute',    value: '* * * * *'     },
    { label: 'Every hour',      value: '0 * * * *'     },
    { label: 'Daily at midnight', value: '0 0 * * *'   },
    { label: 'Daily at noon',   value: '0 12 * * *'    },
    { label: 'Every Sunday',    value: '0 0 * * 0'     },
    { label: 'Monthly (1st)',   value: '0 0 1 * *'     },
    { label: 'Custom',          value: 'custom'        },
  ]

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const DOWS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  function humanize(m: string, h: string, dom: string, month: string, dow: string): string {
    if (m === '*' && h === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute'
    if (m !== '*' && h === '*' && dom === '*' && month === '*' && dow === '*') return `At minute ${m} of every hour`
    if (dom === '*' && month === '*' && dow === '*') {
      const hLabel = h === '*' ? 'every hour' : `${h.padStart(2,'0')}:${m.padStart(2,'0')}`
      return `Daily at ${hLabel}`
    }
    if (dom === '*' && month === '*' && dow !== '*') {
      const dayNames = dow.split(',').map(d => DOWS[parseInt(d)] ?? d).join(', ')
      return `Every ${dayNames} at ${h.padStart(2,'0')}:${m.padStart(2,'0')}`
    }
    if (dom !== '*' && month === '*' && dow === '*') {
      return `Monthly on day ${dom} at ${h.padStart(2,'0')}:${m.padStart(2,'0')}`
    }
    return `${m} ${h} ${dom} ${month} ${dow}`
  }

  function parseRaw(text: string): CronJob[] {
    const result: CronJob[] = []
    let i = 0
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) { i++; continue }

      const isComment = trimmed.startsWith('#')
      const active = isComment ? trimmed.replace(/^#+\s*/, '') : trimmed

      // Skip pure comment lines (no cron fields)
      const parts = active.split(/\s+/)
      if (parts.length < 6) { i++; continue }

      const [minute, hour, dom, month, dow, ...cmdParts] = parts
      const command = cmdParts.join(' ')
      if (!command) { i++; continue }

      result.push({
        id: `c${i}`,
        enabled: !isComment,
        minute, hour, dom, month, dow,
        command,
        raw: line,
        humanSchedule: humanize(minute, hour, dom, month, dow),
      })
      i++
    }
    return result
  }

  function buildRaw(): string {
    const lines: string[] = []
    const original = rawText.split('\n')
    const tracked = new Set(jobs.map(j => j.raw))

    for (const line of original) {
      if (!tracked.has(line)) { lines.push(line); continue }
      const job = jobs.find(j => j.raw === line)
      if (!job) { lines.push(line); continue }
      const cronLine = `${job.minute} ${job.hour} ${job.dom} ${job.month} ${job.dow} ${job.command}`
      lines.push(job.enabled ? cronLine : `# ${cronLine}`)
    }
    return lines.join('\n')
  }

  async function load() {
    loading = true; error = ''
    try {
      rawText = await invoke<string>('crontab:list')
      jobs    = parseRaw(rawText)
      dirty   = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('crontab:set', buildRaw())
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  function toggleJob(id: string) {
    jobs = jobs.map(j => j.id === id ? { ...j, enabled: !j.enabled } : j)
    dirty = true
  }

  function removeJob(id: string) {
    const job = jobs.find(j => j.id === id)
    if (!job) return
    rawText = rawText.split('\n').filter(l => l !== job.raw).join('\n')
    jobs = jobs.filter(j => j.id !== id)
    dirty = true
  }

  function applyPreset(val: string) {
    addPreset = val
    if (val === 'custom' || val === '') return
    const parts = val.split(' ')
    if (parts.length === 5) {
      [addMinute, addHour, addDom, addMonth, addDow] = parts
    }
  }

  function addJob() {
    addError = ''
    if (!addCommand.trim()) { addError = 'Command is required'; return }
    const cronLine = `${addMinute} ${addHour} ${addDom} ${addMonth} ${addDow} ${addCommand.trim()}`
    const id = `c${Date.now()}`
    jobs = [...jobs, {
      id,
      enabled: true,
      minute: addMinute, hour: addHour, dom: addDom, month: addMonth, dow: addDow,
      command: addCommand.trim(),
      raw: cronLine,
      humanSchedule: humanize(addMinute, addHour, addDom, addMonth, addDow),
    }]
    rawText = rawText.trimEnd() + '\n' + cronLine + '\n'
    addCommand = ''; addMinute = '0'; addHour = '*'; addDom = '*'; addMonth = '*'; addDow = '*'
    addPreset = ''; showAdd = false
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
      <h2 class="text-sm font-medium text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</h2>
      <div class="flex gap-2">
        <button
          onclick={() => { showAdd = !showAdd; addError = '' }}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={12} /> Add Job
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

    {#if error}
      <Alert message={error} />
    {/if}

    <!-- Add form -->
    {#if showAdd}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium">New Cron Job</p>

        <!-- Presets -->
        <div class="space-y-1">
          <p class="text-xs text-muted-foreground">Schedule preset</p>
          <select
            bind:value={addPreset}
            onchange={() => applyPreset(addPreset)}
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                   focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— pick a preset —</option>
            {#each PRESETS as p}
              <option value={p.value}>{p.label}</option>
            {/each}
          </select>
        </div>

        <!-- Cron fields -->
        <div class="grid grid-cols-5 gap-2">
          {#each [
            { label: 'Minute',     bind: addMinute,  setter: (v: string) => addMinute = v  },
            { label: 'Hour',       bind: addHour,    setter: (v: string) => addHour   = v  },
            { label: 'Day/Month',  bind: addDom,     setter: (v: string) => addDom    = v  },
            { label: 'Month',      bind: addMonth,   setter: (v: string) => addMonth  = v  },
            { label: 'Day/Week',   bind: addDow,     setter: (v: string) => addDow    = v  },
          ] as field}
            <div class="space-y-1">
              <span class="text-[10px] text-muted-foreground">{field.label}</span>
              <input
                value={field.bind}
                oninput={(e) => field.setter((e.target as HTMLInputElement).value)}
                class="w-full rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-sm
                       font-mono focus:outline-none focus:ring-1 focus:ring-primary text-center"
              />
            </div>
          {/each}
        </div>

        <p class="text-xs text-muted-foreground italic">
          Preview: {humanize(addMinute, addHour, addDom, addMonth, addDow)}
        </p>

        <!-- Command -->
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground" for="add-command">Command</label>
          <input
            id="add-command"
            bind:value={addCommand}
            placeholder="/path/to/script.sh"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                   font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {#if addError}<p class="text-xs text-destructive">{addError}</p>{/if}

        <div class="flex gap-2">
          <button onclick={addJob} class="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Add</button>
          <button onclick={() => showAdd = false} class="px-3 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80">Cancel</button>
        </div>
      </div>
    {/if}

    {#if dirty}
      <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5 flex items-center gap-2">
        <AlertTriangle size={13} class="text-yellow-400 shrink-0" />
        <p class="text-xs text-yellow-400">Unsaved changes — click Save to write the crontab</p>
      </div>
    {/if}

    <!-- Job list -->
    {#if jobs.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-2">
        <Clock size={32} class="mx-auto text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No cron jobs found</p>
        <p class="text-xs text-muted-foreground/70">Add a job to schedule recurring tasks</p>
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {#each jobs as job}
          <div class="flex items-center gap-3 px-4 py-3 {job.enabled ? '' : 'opacity-50'}">
            <div class="p-1.5 rounded-lg bg-secondary shrink-0">
              <Clock size={13} class="text-muted-foreground" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium font-mono truncate">{job.command}</p>
              <p class="text-xs text-muted-foreground">{job.humanSchedule}</p>
              <p class="text-[10px] font-mono text-muted-foreground/40 mt-0.5">
                {job.minute} {job.hour} {job.dom} {job.month} {job.dow}
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                onclick={() => toggleJob(job.id)}
                aria-label="{job.enabled ? 'Disable' : 'Enable'} job"
                title="{job.enabled ? 'Disable' : 'Enable'}"
                class="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
              >
                {#if job.enabled}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
              </button>
              <button
                onclick={() => removeJob(job.id)}
                aria-label="Remove job"
                class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
{/if}
