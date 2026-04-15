<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Eye, Keyboard, Mouse, Volume2 } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type A11yStatus = {
    highContrast: boolean; largeText: boolean
    screenReader: boolean; magnifier: boolean
    stickyKeys: boolean; slowKeys: boolean; bounceKeys: boolean; toggleKeys: boolean; mouseKeys: boolean
    secondaryClick: boolean; dwellClick: boolean
    visualBell: boolean
  }

  let status  = $state<A11yStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)

  async function load() {
    loading = true; error = ''
    try { status = await invoke<A11yStatus>('accessibility:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function set(key: keyof A11yStatus, value: boolean) {
    if (!status) return
    status = { ...status, [key]: value }
    saving = true
    try { await invoke('accessibility:set', { [key]: value }) }
    catch (e) { error = String(e); await load() }
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

    {#snippet toggleRow(label: string, desc: string, key: keyof A11yStatus)}
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0 pr-4">
          <p class="text-sm">{label}</p>
          <p class="text-xs text-muted-foreground">{desc}</p>
        </div>
        <button
          onclick={() => set(key, !status![key])}
          disabled={saving}
          aria-label="Toggle {label}"
          class="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50
                 {status[key] ? 'bg-primary' : 'bg-secondary border border-border'}"
        >
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                       {status[key] ? 'translate-x-5' : ''}"></span>
        </button>
      </div>
    {/snippet}

    <!-- Vision -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Eye size={14} class="text-muted-foreground" /> Vision
      </p>
      {@render toggleRow('High Contrast', 'Use high contrast GTK theme', 'highContrast')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Screen Reader', 'Enable Orca screen reader', 'screenReader')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Screen Magnifier', 'Zoom into areas of the screen', 'magnifier')}
    </div>

    <!-- Keyboard -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Keyboard size={14} class="text-muted-foreground" /> Keyboard
      </p>
      {@render toggleRow('Sticky Keys', 'Type keyboard shortcuts one key at a time', 'stickyKeys')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Slow Keys', 'Add a delay before a keypress is accepted', 'slowKeys')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Bounce Keys', 'Ignore fast duplicate keypresses', 'bounceKeys')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Toggle Keys', 'Beep on Caps Lock / Num Lock', 'toggleKeys')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Mouse Keys', 'Control the pointer with the numpad', 'mouseKeys')}
    </div>

    <!-- Mouse -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Mouse size={14} class="text-muted-foreground" /> Pointing & Clicking
      </p>
      {@render toggleRow('Secondary Click', 'Trigger right-click by holding the mouse button', 'secondaryClick')}
      <div class="border-t border-border"></div>
      {@render toggleRow('Hover Click', 'Trigger click by hovering over an item', 'dwellClick')}
    </div>

    <!-- Audio / Alerts -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Volume2 size={14} class="text-muted-foreground" /> Alerts
      </p>
      {@render toggleRow('Visual Alerts', 'Flash the screen instead of a beep', 'visualBell')}
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

  </div>
{/if}
