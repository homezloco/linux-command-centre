<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Clock, Globe, Wifi } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type DateTimeStatus = {
    timezone: string; ntpEnabled: boolean; ntpSynced: boolean
    localTime: string; universalTime: string; rtcTime: string
  }

  let status    = $state<DateTimeStatus | null>(null)
  let timezones = $state<string[]>([])
  let loading   = $state(true)
  let error     = $state('')
  let saving    = $state(false)

  let tzSearch  = $state('')
  let showTzPicker = $state(false)

  // Live clock
  let now = $state(new Date())
  let clockInterval: ReturnType<typeof setInterval> | undefined

  async function load() {
    loading = true; error = ''
    try { status = await invoke<DateTimeStatus>('datetime:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function loadTimezones() {
    try { timezones = await invoke<string[]>('datetime:listTimezones') }
    catch { /* non-critical */ }
  }

  async function setTimezone(tz: string) {
    saving = true; error = ''
    try {
      await invoke('datetime:setTimezone', tz)
      showTzPicker = false
      tzSearch = ''
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  async function toggleNtp() {
    if (!status) return
    saving = true; error = ''
    try {
      await invoke('datetime:setNtp', !status.ntpEnabled)
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  const filteredTz = $derived(
    tzSearch.trim()
      ? timezones.filter(tz => tz.toLowerCase().includes(tzSearch.toLowerCase())).slice(0, 60)
      : timezones.slice(0, 60)
  )

  // Group timezone for display
  function tzRegion(tz: string): string { return tz.split('/')[0] }
  function tzCity(tz: string): string   { return tz.split('/').slice(1).join('/').replace(/_/g, ' ') }

  onMount(() => {
    load()
    loadTimezones()
    clockInterval = setInterval(() => now = new Date(), 1000)
  })
  onDestroy(() => clearInterval(clockInterval))
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Live clock -->
    <div class="rounded-xl border border-border bg-card p-5 text-center space-y-1">
      <p class="text-4xl font-mono font-semibold tabular-nums tracking-tight">
        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p class="text-sm text-muted-foreground">
        {now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <!-- NTP -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg {status.ntpEnabled ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground'}">
            <Wifi size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">Automatic time (NTP)</p>
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
        {#if saving}
          <RefreshCw size={16} class="animate-spin text-muted-foreground" />
        {:else}
          <button
            onclick={toggleNtp}
            aria-label="Toggle automatic time"
            class="relative w-11 h-6 rounded-full transition-colors
                   {status.ntpEnabled ? 'bg-green-500' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                         {status.ntpEnabled ? 'translate-x-5' : ''}"></span>
          </button>
        {/if}
      </div>
    </div>

    <!-- Timezone -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary">
            <Globe size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">Timezone</p>
            <p class="text-xs text-muted-foreground">{status.timezone}</p>
          </div>
        </div>
        <button
          onclick={() => { showTzPicker = !showTzPicker; if (showTzPicker && timezones.length === 0) loadTimezones() }}
          class="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
        >
          Change
        </button>
      </div>

      {#if showTzPicker}
        <div class="space-y-2 border-t border-border pt-3">
          <input
            bind:value={tzSearch}
            placeholder="Search timezone…"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                   text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {#if timezones.length === 0}
            <div class="flex items-center justify-center py-4">
              <RefreshCw size={14} class="animate-spin text-muted-foreground" />
            </div>
          {:else}
            <div class="max-h-52 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
              {#each filteredTz as tz}
                <button
                  onclick={() => setTimezone(tz)}
                  disabled={saving}
                  class="w-full flex items-center justify-between px-3 py-2 text-left text-sm
                         hover:bg-secondary/50 transition-colors
                         {tz === status.timezone ? 'bg-primary/10 text-primary' : ''}"
                >
                  <span>{tzCity(tz) || tz}</span>
                  <span class="text-xs text-muted-foreground">{tzRegion(tz)}</span>
                </button>
              {/each}
              {#if filteredTz.length === 60 && !tzSearch}
                <p class="px-3 py-2 text-xs text-muted-foreground text-center">Search to filter {timezones.length} timezones</p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Time details -->
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <Clock size={12} /><span class="text-xs">UTC</span>
        </div>
        <p class="text-xs font-mono">{status.universalTime}</p>
      </div>
      <div class="rounded-xl border border-border bg-card p-3 space-y-1">
        <div class="flex items-center gap-2 text-muted-foreground mb-1">
          <Clock size={12} /><span class="text-xs">RTC (hardware)</span>
        </div>
        <p class="text-xs font-mono">{status.rtcTime}</p>
      </div>
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

  </div>
{/if}
