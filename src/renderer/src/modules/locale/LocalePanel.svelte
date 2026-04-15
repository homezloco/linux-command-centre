<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Globe, AlertTriangle } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type LocaleStatus = { lang: string; x11Layout: string; region: string }

  let status    = $state<LocaleStatus | null>(null)
  let locales   = $state<string[]>([])
  let loading   = $state(true)
  let error     = $state('')
  let saving    = $state(false)
  let reloginNote = $state(false)

  let selected  = $state('')
  let search    = $state('')
  let showPicker = $state(false)

  const filtered = $derived(
    search.trim()
      ? locales.filter(l => l.toLowerCase().includes(search.toLowerCase())).slice(0, 80)
      : locales.slice(0, 80)
  )

  async function load() {
    loading = true; error = ''
    try { status = await invoke<LocaleStatus>('locale:status'); selected = status.lang }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function loadLocales() {
    if (locales.length) return
    try { locales = await invoke<string[]>('locale:listLocales') }
    catch { /* non-critical */ }
  }

  async function applyLocale() {
    if (!selected || selected === status?.lang) return
    saving = true; error = ''
    try {
      await invoke('locale:set', selected)
      reloginNote = true
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
  <div class="space-y-4 max-w-sm">

    <!-- Current locale info -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Globe size={14} class="text-muted-foreground" /> Current Locale
      </p>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="rounded-lg bg-secondary/50 p-2.5">
          <p class="text-muted-foreground mb-1">Language (LANG)</p>
          <p class="font-mono font-medium">{status.lang || 'Not set'}</p>
        </div>
        <div class="rounded-lg bg-secondary/50 p-2.5">
          <p class="text-muted-foreground mb-1">Region</p>
          <p class="font-mono font-medium">{status.region || 'Not set'}</p>
        </div>
        <div class="rounded-lg bg-secondary/50 p-2.5 col-span-2">
          <p class="text-muted-foreground mb-1">Keyboard Layout</p>
          <p class="font-mono font-medium">{status.x11Layout || 'Not set'}</p>
        </div>
      </div>
    </div>

    <!-- Locale picker -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Change System Locale</p>
      <p class="text-xs text-muted-foreground">Sets the LANG environment variable system-wide. Requires re-login to take full effect.</p>

      <button
        onclick={() => { showPicker = !showPicker; if (showPicker) loadLocales() }}
        class="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border
               hover:bg-secondary/50 transition-colors text-sm"
      >
        <span class="font-mono">{selected || 'Select locale…'}</span>
        <RefreshCw size={12} class="text-muted-foreground {showPicker ? 'rotate-180' : ''}" />
      </button>

      {#if showPicker}
        <div class="space-y-2">
          <input
            bind:value={search}
            placeholder="Search locales…"
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                   text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {#if locales.length === 0}
            <div class="flex justify-center py-4"><RefreshCw size={14} class="animate-spin text-muted-foreground" /></div>
          {:else}
            <div class="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
              {#each filtered as locale}
                <button
                  onclick={() => { selected = locale; showPicker = false; search = '' }}
                  class="w-full px-3 py-2 text-left text-sm font-mono hover:bg-secondary/50 transition-colors
                         {selected === locale ? 'bg-primary/10 text-primary' : ''}"
                >
                  {locale}
                </button>
              {/each}
              {#if filtered.length === 80 && !search}
                <p class="px-3 py-2 text-xs text-muted-foreground text-center">Search to filter {locales.length} locales</p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if error}
        <Alert message={error} />
      {/if}

      {#if reloginNote}
        <div class="rounded-lg bg-yellow-400/10 border border-yellow-400/30 p-2.5 flex items-center gap-2">
          <AlertTriangle size={13} class="text-yellow-400 shrink-0" />
          <p class="text-xs text-yellow-400">Locale changed. Re-login to apply fully.</p>
        </div>
      {/if}

      {#if selected !== status.lang}
        <button
          onclick={applyLocale}
          disabled={saving}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {#if saving}<RefreshCw size={12} class="animate-spin" />{/if}
          Apply
        </button>
      {/if}
    </div>

  </div>
{/if}
