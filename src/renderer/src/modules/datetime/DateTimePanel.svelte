<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, Listbox } from '$ui'
  import { RefreshCw, Clock, Globe, Wifi } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  let { visible = true }: { visible?: boolean } = $props()

  type DateTimeStatus = {
    timezone: string; ntpEnabled: boolean; ntpSynced: boolean
    localTime: string; universalTime: string; rtcTime: string
  }

  const TITLE = 'Date & Time'

  let status    = $state<DateTimeStatus | null>(null)
  let timezones = $state<string[]>([])
  let loading   = $state(true)
  let refreshing = $state(false)
  let error     = $state('')
  let savingTz  = $state(false)
  let savingNtp = $state(false)

  // Live clock — only ticks while the panel is visible
  let now = $state(new Date())

  const tzOptions = $derived.by(() => {
    const opts = timezones.map(tz => ({ value: tz, label: tz.replace(/_/g, ' ') }))
    // Keep the current zone selectable even if the list has not loaded (or lacks it)
    if (status && !timezones.includes(status.timezone)) {
      opts.unshift({ value: status.timezone, label: status.timezone.replace(/_/g, ' ') })
    }
    return opts
  })

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<DateTimeStatus>('datetime:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function loadTimezones() {
    try { timezones = await invoke<string[]>('datetime:listTimezones') }
    catch { /* non-critical */ }
  }

  async function setTimezone(tz: string) {
    if (!status || tz === status.timezone) return
    savingTz = true
    try {
      await invoke('datetime:setTimezone', tz)
      toasts.success(`Timezone set to ${tz}`, TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { savingTz = false }
  }

  async function setNtp(on: boolean) {
    savingNtp = true
    try {
      await invoke('datetime:setNtp', on)
      toasts.success(on ? 'Automatic time enabled' : 'Automatic time disabled', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { savingNtp = false }
  }

  onMount(() => {
    void load()
    void loadTimezones()
  })

  $effect(() => {
    if (!visible) return
    now = new Date()
    const id = setInterval(() => { now = new Date() }, 1000)
    return () => clearInterval(id)
  })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh date and time"
      disabled={refreshing || loading}
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
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-24 w-full" />
      <div class="grid grid-cols-2 gap-3">
        <Skeleton class="h-16 w-full" />
        <Skeleton class="h-16 w-full" />
      </div>

    {:else if status}
      <!-- Live clock -->
      <Card class="p-5 text-center space-y-1">
        <p class="text-4xl font-mono font-semibold tabular-nums tracking-tight">
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <p class="text-[13px] text-muted-foreground">
          {now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </Card>

      <!-- NTP -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-lg shrink-0 {status.ntpEnabled ? 'bg-status-ok/10 text-status-ok' : 'bg-secondary text-muted-foreground'}">
            <Wifi size={16} />
          </div>
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="ntp-label">Automatic time (NTP)</p>
            <p class="text-xs text-muted-foreground">
              {#if status.ntpEnabled && status.ntpSynced}
                Synchronized
              {:else if status.ntpEnabled}
                Enabled, syncing…
              {:else}
                Disabled — time set manually
              {/if}
            </p>
          </div>
        </div>
        <Toggle checked={status.ntpEnabled} disabled={savingNtp} aria-labelledby="ntp-label" onCheckedChange={(v) => setNtp(v)} />
      </Card>

      <!-- Timezone -->
      <Card class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Globe size={16} />
          </div>
          <div class="min-w-0">
            <label for="timezone" class="text-[13px] font-medium">Timezone</label>
            <p class="text-xs text-muted-foreground">Changing the zone requires authentication.</p>
          </div>
        </div>
        <Listbox
          id="timezone"
          filterable
          value={status.timezone}
          options={tzOptions}
          disabled={savingTz}
          placeholder="Search timezones…"
          onChange={(v) => setTimezone(v)}
        />
      </Card>

      <!-- Time details -->
      <div class="grid grid-cols-2 gap-3">
        <Card padding="sm" class="space-y-1">
          <div class="flex items-center gap-2 text-muted-foreground">
            <Clock size={12} /><span class="text-xs">UTC</span>
          </div>
          <p class="text-xs font-mono">{status.universalTime}</p>
        </Card>
        <Card padding="sm" class="space-y-1">
          <div class="flex items-center gap-2 text-muted-foreground">
            <Clock size={12} /><span class="text-xs">RTC (hardware)</span>
          </div>
          <p class="text-xs font-mono">{status.rtcTime}</p>
        </Card>
      </div>
    {/if}
  </div>
</Page>
