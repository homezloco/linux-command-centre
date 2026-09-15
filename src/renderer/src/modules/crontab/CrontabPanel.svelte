<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox, EmptyState } from '$ui'
  import { RefreshCw, Plus, Trash2, Eye, EyeOff, Save, Clock } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type CronJob = {
    id: string
    enabled: boolean
    minute: string; hour: string; dom: string; month: string; dow: string
    command: string
    raw: string
    humanSchedule: string
  }

  const TITLE = 'Cron Jobs'
  const inputCls = 'w-full h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'

  let jobs    = $state<CronJob[]>([])
  let rawText = $state('')
  let loading = $state(true)
  let refreshing = $state(false)
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

  const PRESET_OPTIONS = [
    { label: 'Every minute',      value: '* * * * *'   },
    { label: 'Every hour',        value: '0 * * * *'   },
    { label: 'Daily at midnight', value: '0 0 * * *'   },
    { label: 'Daily at noon',     value: '0 12 * * *'  },
    { label: 'Every Sunday',      value: '0 0 * * 0'   },
    { label: 'Monthly (1st)',     value: '0 0 1 * *'   },
    { label: 'Custom',            value: 'custom'      },
  ]

  const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      rawText = await invoke<string>('crontab:list')
      jobs    = parseRaw(rawText)
      dirty   = false
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  // Explicit Save: writes the whole crontab (privileged)
  async function save() {
    saving = true
    try {
      await invoke('crontab:set', buildRaw())
      toasts.success('Crontab saved', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
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

<Page width="wide">
  {#snippet actions()}
    <Button variant="primary" size="sm" disabled={loading} onclick={() => { showAdd = !showAdd; addError = '' }}>
      <Plus size={13} /> Add Job
    </Button>
    {#if dirty}
      <Button variant="secondary" size="sm" loading={saving} onclick={save}>
        {#if !saving}<Save size={13} />{/if}
        Save
      </Button>
    {/if}
    <Button
      variant="icon"
      size="sm"
      aria-label={dirty ? 'Discard changes and reload' : 'Reload crontab'}
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
      <Skeleton class="h-3 w-20" />
      <Card padding="none">
        {#each [0, 1, 2] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton class="h-7 w-7 rounded-lg shrink-0" />
            <div class="flex-1 space-y-1.5">
              <Skeleton class="h-3 w-56" />
              <Skeleton class="h-2.5 w-36" />
            </div>
          </div>
        {/each}
      </Card>

    {:else}
      <h2 class="text-[13px] font-medium text-muted-foreground">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</h2>

      <!-- Add form -->
      {#if showAdd}
        <Card class="space-y-3">
          <p class="text-[13px] font-medium">New Cron Job</p>
          <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); addJob() }}>
            <div class="space-y-1.5">
              <label class="text-xs text-muted-foreground" for="cron-preset">Schedule preset</label>
              <Listbox
                id="cron-preset"
                placeholder="Pick a preset…"
                value={addPreset}
                options={PRESET_OPTIONS}
                onChange={applyPreset}
              />
            </div>

            <div class="grid grid-cols-5 gap-2">
              {#each [
                { label: 'Minute',    bind: addMinute, setter: (v: string) => addMinute = v },
                { label: 'Hour',      bind: addHour,   setter: (v: string) => addHour   = v },
                { label: 'Day/Month', bind: addDom,    setter: (v: string) => addDom    = v },
                { label: 'Month',     bind: addMonth,  setter: (v: string) => addMonth  = v },
                { label: 'Day/Week',  bind: addDow,    setter: (v: string) => addDow    = v },
              ] as field (field.label)}
                <div class="space-y-1">
                  <span class="text-[11px] text-muted-foreground">{field.label}</span>
                  <input
                    value={field.bind}
                    oninput={(e) => field.setter((e.target as HTMLInputElement).value)}
                    aria-label={field.label}
                    class="{inputCls} px-2 font-mono text-center"
                  />
                </div>
              {/each}
            </div>

            <p class="text-xs text-muted-foreground italic">
              Preview: {humanize(addMinute, addHour, addDom, addMonth, addDow)}
            </p>

            <div class="space-y-1">
              <label class="text-xs text-muted-foreground" for="add-command">Command</label>
              <input
                id="add-command"
                bind:value={addCommand}
                placeholder="/path/to/script.sh"
                class="{inputCls} font-mono"
              />
            </div>

            {#if addError}<p class="text-xs text-destructive">{addError}</p>{/if}

            <div class="flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={!addCommand.trim()}>Add</Button>
              <Button variant="secondary" size="sm" onclick={() => { showAdd = false; addError = '' }}>Cancel</Button>
            </div>
          </form>
        </Card>
      {/if}

      {#if dirty}
        <Alert variant="warn" message="Unsaved changes — click Save to write the crontab." />
      {/if}

      <!-- Job list -->
      {#if jobs.length === 0}
        <EmptyState icon={Clock} title="No cron jobs" message="Add a job to schedule recurring tasks.">
          {#snippet action()}
            <Button variant="primary" size="sm" onclick={() => { showAdd = true }}><Plus size={13} /> Add Job</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <Card padding="none" class="divide-y divide-border overflow-hidden">
          {#each jobs as job (job.id)}
            <div class="flex items-center gap-3 px-4 py-3 {job.enabled ? '' : 'opacity-50'}">
              <div class="p-1.5 rounded-lg bg-secondary shrink-0">
                <Clock size={13} class="text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium font-mono truncate">{job.command}</p>
                <p class="text-xs text-muted-foreground">{job.humanSchedule}</p>
                <p class="text-[11px] font-mono text-muted-foreground/40 mt-0.5">
                  {job.minute} {job.hour} {job.dom} {job.month} {job.dow}
                </p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="{job.enabled ? 'Disable' : 'Enable'} job {job.command}"
                  onclick={() => toggleJob(job.id)}
                >
                  {#if job.enabled}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
                </Button>
                <Button
                  variant="icon"
                  size="sm"
                  aria-label="Remove job {job.command}"
                  class="hover:text-destructive"
                  onclick={() => removeJob(job.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          {/each}
        </Card>
      {/if}
    {/if}
  </div>
</Page>
