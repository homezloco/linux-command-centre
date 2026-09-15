<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle } from '$ui'
  import { RefreshCw, Keyboard } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type KeyboardStatus = {
    delay: number
    interval: number
    repeat: boolean
    layouts: { type: string; id: string }[]
    activeLayout: string
    xkbOptions: string[]
  }
  type KeyboardOpts = { delay?: number; interval?: number; repeat?: boolean }

  const TITLE = 'Keyboard'

  let status  = $state<KeyboardStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')

  // Editable copies — every control saves instantly (keyboard:set accepts partial opts)
  let delay    = $state(500)
  let interval = $state(30)
  let repeat   = $state(true)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<KeyboardStatus>('keyboard:status')
      delay    = status.delay
      interval = status.interval
      repeat   = status.repeat
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function apply(opts: KeyboardOpts) {
    try { await invoke('keyboard:set', opts) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert to what the desktop actually has
    }
  }

  const pushDelay    = debounce((v: number) => { void apply({ delay: v }) })
  const pushInterval = debounce((v: number) => { void apply({ interval: v }) })

  function setRepeat(v: boolean) {
    repeat = v
    void apply({ repeat: v })
  }

  // Friendly layout name
  function layoutLabel(id: string): string {
    const map: Record<string, string> = {
      us: 'English (US)', gb: 'English (UK)', de: 'German', fr: 'French',
      es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
      ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ar: 'Arabic',
      nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish',
      fi: 'Finnish', no: 'Norwegian', tr: 'Turkish', cs: 'Czech',
    }
    const base = id.split('+')[0]
    return map[base] ?? id.toUpperCase()
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload keyboard settings"
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
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-48 w-full" />

    {:else if status}
      <!-- Layouts -->
      <Card class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10 text-primary"><Keyboard size={16} /></div>
          <p class="text-[13px] font-medium">Active layout</p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#each status.layouts as layout, i (i)}
            <div class="px-3 py-1.5 rounded-lg border text-[13px]
                        {layout.id === status.activeLayout
                          ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                          : 'border-border bg-secondary/50 text-muted-foreground'}">
              {layoutLabel(layout.id)}
              <span class="text-[11px] opacity-70 ml-1">{layout.id}</span>
            </div>
          {/each}
        </div>
        {#if status.xkbOptions.length > 0}
          <p class="text-xs text-muted-foreground">
            Options: {status.xkbOptions.join(', ')}
          </p>
        {/if}
        <p class="text-xs text-muted-foreground">
          Manage layouts in <span class="font-medium">Settings → Keyboard → Input Sources</span>
        </p>
      </Card>

      <!-- Key repeat -->
      <Card class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-[13px] font-medium" id="kbd-repeat-label">Key repeat</p>
          <Toggle checked={repeat} aria-labelledby="kbd-repeat-label" onCheckedChange={setRepeat} />
        </div>

        {#if repeat}
          <div class="space-y-2">
            <div class="flex items-center justify-between text-[13px]">
              <label for="kbd-delay" class="text-muted-foreground">Initial delay</label>
              <span class="font-medium tabular-nums">{delay} ms</span>
            </div>
            <input
              id="kbd-delay"
              type="range" min="100" max="2000" step="50"
              bind:value={delay}
              oninput={() => pushDelay(delay)}
              class="w-full accent-primary"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Fast (100 ms)</span><span>Slow (2000 ms)</span>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-[13px]">
              <label for="kbd-rate" class="text-muted-foreground">Repeat speed</label>
              <span class="font-medium tabular-nums">{interval} ms</span>
            </div>
            <input
              id="kbd-rate"
              type="range" min="10" max="200" step="5"
              bind:value={interval}
              oninput={() => pushInterval(interval)}
              class="w-full accent-primary"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>Fast (10 ms)</span><span>Slow (200 ms)</span>
            </div>
          </div>
        {/if}
      </Card>
    {/if}
  </div>
</Page>
