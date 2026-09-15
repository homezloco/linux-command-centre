<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle } from '$ui'
  import { RefreshCw, Eye, Keyboard, Mouse, Volume2 } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  // `largeText` is reported by accessibility:status but intentionally has no row here —
  // Command Centre text size lives on Appearance, and the desktop's Large Text is GNOME's.
  type A11yStatus = {
    highContrast: boolean; largeText: boolean
    screenReader: boolean; magnifier: boolean
    stickyKeys: boolean; slowKeys: boolean; bounceKeys: boolean; toggleKeys: boolean; mouseKeys: boolean
    secondaryClick: boolean; dwellClick: boolean
    visualBell: boolean
  }
  type A11yKey = Exclude<keyof A11yStatus, 'largeText'>

  const TITLE = 'Accessibility'

  let status  = $state<A11yStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')
  let saving  = $state(false)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<A11yStatus>('accessibility:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function set(key: A11yKey, value: boolean) {
    if (!status) return
    status = { ...status, [key]: value }
    saving = true
    try { await invoke('accessibility:set', { [key]: value }) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert to what the desktop actually has
    }
    finally { saving = false }
  }

  onMount(() => { void load() })
</script>

{#snippet toggleRow(label: string, desc: string, key: A11yKey, checked: boolean, disclaimer?: string)}
  {@const discId = disclaimer ? `a11y-disc-${key}` : undefined}
  <div class="flex items-center justify-between gap-4">
    <div class="flex-1 min-w-0">
      <p class="text-[13px]" id="a11y-{key}-label">{label}</p>
      <p class="text-xs text-muted-foreground">{desc}</p>
      {#if disclaimer}
        <p id={discId} class="text-xs text-muted-foreground">{disclaimer}</p>
      {/if}
    </div>
    <Toggle
      {checked}
      disabled={saving}
      aria-labelledby="a11y-{key}-label"
      onCheckedChange={(v) => set(key, v)}
    />
  </div>
{/snippet}

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh accessibility settings"
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
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-28 w-full" />

    {:else if status}
      <!-- Vision -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Eye size={14} class="text-muted-foreground" /> Vision
        </p>
        {@render toggleRow('High Contrast', 'Use high contrast GTK theme', 'highContrast', status.highContrast, 'Applies to the desktop, not Command Centre.')}
        <div class="border-t border-border"></div>
        {@render toggleRow('Screen Reader', 'Enable Orca screen reader', 'screenReader', status.screenReader, 'Applies to the desktop, not Command Centre.')}
        <div class="border-t border-border"></div>
        {@render toggleRow('Screen Magnifier', 'Zoom into areas of the screen', 'magnifier', status.magnifier)}
      </Card>

      <!-- Keyboard -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Keyboard size={14} class="text-muted-foreground" /> Keyboard
        </p>
        {@render toggleRow('Sticky Keys', 'Type keyboard shortcuts one key at a time', 'stickyKeys', status.stickyKeys)}
        <div class="border-t border-border"></div>
        {@render toggleRow('Slow Keys', 'Add a delay before a keypress is accepted', 'slowKeys', status.slowKeys)}
        <div class="border-t border-border"></div>
        {@render toggleRow('Bounce Keys', 'Ignore fast duplicate keypresses', 'bounceKeys', status.bounceKeys)}
        <div class="border-t border-border"></div>
        {@render toggleRow('Toggle Keys', 'Beep on Caps Lock / Num Lock', 'toggleKeys', status.toggleKeys)}
        <div class="border-t border-border"></div>
        {@render toggleRow('Mouse Keys', 'Control the pointer with the numpad', 'mouseKeys', status.mouseKeys)}
      </Card>

      <!-- Pointing -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Mouse size={14} class="text-muted-foreground" /> Pointing &amp; clicking
        </p>
        {@render toggleRow('Secondary Click', 'Trigger right-click by holding the mouse button', 'secondaryClick', status.secondaryClick)}
        <div class="border-t border-border"></div>
        {@render toggleRow('Hover Click', 'Trigger click by hovering over an item', 'dwellClick', status.dwellClick)}
      </Card>

      <!-- Alerts -->
      <Card class="space-y-3">
        <p class="text-[13px] font-medium flex items-center gap-2">
          <Volume2 size={14} class="text-muted-foreground" /> Alerts
        </p>
        {@render toggleRow('Visual Alerts', 'Flash the screen instead of a beep', 'visualBell', status.visualBell)}
      </Card>
    {/if}
  </div>
</Page>
