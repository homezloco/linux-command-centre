<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Keyboard } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type KeyboardStatus = {
    delay: number
    interval: number
    repeat: boolean
    layouts: { type: string; id: string }[]
    activeLayout: string
    xkbOptions: string[]
  }

  let status  = $state<KeyboardStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)

  // Editable copies
  let delay    = $state(500)
  let interval = $state(30)
  let repeat   = $state(true)
  let dirty    = $state(false)

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<KeyboardStatus>('keyboard:status')
      delay    = status.delay
      interval = status.interval
      repeat   = status.repeat
      dirty    = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('keyboard:set', { delay, interval, repeat })
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  function mark() { dirty = true }

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

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Layouts -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-primary/10 text-primary"><Keyboard size={16} /></div>
        <p class="text-sm font-medium">Active Layout</p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each status.layouts as layout}
          <div class="px-3 py-1.5 rounded-lg border text-sm
                      {layout.id === status.activeLayout
                        ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                        : 'border-border bg-secondary/50 text-muted-foreground'}">
            {layoutLabel(layout.id)}
            <span class="text-xs opacity-60 ml-1">{layout.id}</span>
          </div>
        {/each}
      </div>
      {#if status.xkbOptions.length > 0}
        <p class="text-xs text-muted-foreground">
          Options: {status.xkbOptions.join(', ')}
        </p>
      {/if}
      <p class="text-xs text-muted-foreground/60">
        Manage layouts in <span class="font-medium">Settings → Keyboard → Input Sources</span>
      </p>
    </div>

    <!-- Key Repeat -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium">Key Repeat</p>
        <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <span>Enabled</span>
          <button
            onclick={() => { repeat = !repeat; mark() }}
            aria-label="Toggle key repeat"
            class="relative w-9 h-5 rounded-full transition-colors
                   {repeat ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                         {repeat ? 'translate-x-4' : ''}"></span>
          </button>
        </label>
      </div>

      {#if repeat}
        <!-- Repeat Delay -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <label for="kbd-delay" class="text-muted-foreground">Initial delay</label>
            <span class="font-medium tabular-nums">{delay} ms</span>
          </div>
          <input
            id="kbd-delay"
            type="range" min="100" max="2000" step="50"
            bind:value={delay}
            oninput={mark}
            class="w-full accent-primary"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Fast (100ms)</span><span>Slow (2000ms)</span>
          </div>
        </div>

        <!-- Repeat Rate -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <label for="kbd-rate" class="text-muted-foreground">Repeat speed</label>
            <span class="font-medium tabular-nums">{interval} ms</span>
          </div>
          <input
            id="kbd-rate"
            type="range" min="10" max="200" step="5"
            bind:value={interval}
            oninput={mark}
            class="w-full accent-primary"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Fast (10ms)</span><span>Slow (200ms)</span>
          </div>
        </div>
      {/if}

      {#if error}
        <Alert message={error} />
      {/if}

      {#if dirty}
        <div class="flex gap-2 pt-1">
          <button
            onclick={save}
            disabled={saving}
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                   bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {#if saving}<RefreshCw size={12} class="animate-spin" />{/if}
            Apply
          </button>
          <button
            onclick={load}
            disabled={saving}
            class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      {/if}
    </div>

  </div>
{/if}
