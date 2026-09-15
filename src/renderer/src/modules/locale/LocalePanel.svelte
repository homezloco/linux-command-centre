<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox } from '$ui'
  import { RefreshCw, Globe } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type LocaleStatus = { lang: string; x11Layout: string; region: string }

  const TITLE = 'Language'

  let status    = $state<LocaleStatus | null>(null)
  let locales   = $state<string[]>([])
  let loading   = $state(true)
  let refreshing = $state(false)
  let error     = $state('')
  let saving    = $state(false)
  let reloginNote = $state(false)

  let selected  = $state('')

  const localeOptions = $derived.by(() => {
    const opts = locales.map(l => ({ value: l, label: l }))
    if (status?.lang && !locales.includes(status.lang)) opts.unshift({ value: status.lang, label: status.lang })
    return opts
  })
  const dirty = $derived(!!selected && selected !== status?.lang)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<LocaleStatus>('locale:status'); selected = status.lang }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function loadLocales() {
    try { locales = await invoke<string[]>('locale:listLocales') }
    catch { /* non-critical */ }
  }

  // Explicit Apply: locale:set is privileged and only takes full effect after re-login
  async function applyLocale() {
    if (!dirty) return
    saving = true
    try {
      await invoke('locale:set', selected)
      toasts.success(`Locale set to ${selected} — re-login to apply fully`, TITLE)
      reloginNote = true
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { saving = false }
  }

  onMount(() => { void load(); void loadLocales() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload locale settings"
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
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-28 w-full" />

    {:else if status}
      <!-- Current locale -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Globe size={14} class="text-muted-foreground" /> Current locale
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
            <p class="text-muted-foreground mb-1">Keyboard layout</p>
            <p class="font-mono font-medium">{status.x11Layout || 'Not set'}</p>
          </div>
        </div>
      </Card>

      <!-- Locale picker -->
      <Card class="space-y-3">
        <div>
          <label for="locale" class="text-[13px] font-medium">Change system locale</label>
          <p class="text-xs text-muted-foreground">Sets LANG system-wide. Requires re-login to take full effect.</p>
        </div>

        <Listbox
          id="locale"
          filterable
          value={selected}
          options={localeOptions}
          disabled={saving}
          placeholder={locales.length ? 'Search locales…' : 'Loading locales…'}
          onChange={(v) => { selected = v }}
        />

        {#if reloginNote}
          <Alert variant="warn" message="Locale changed. Re-login to apply fully." />
        {/if}

        {#if dirty}
          <div class="flex gap-2">
            <Button variant="primary" size="sm" loading={saving} onclick={applyLocale}>Apply</Button>
            <Button variant="secondary" size="sm" disabled={saving} onclick={() => { selected = status?.lang ?? '' }}>Reset</Button>
          </div>
        {/if}
      </Card>
    {/if}
  </div>
</Page>
