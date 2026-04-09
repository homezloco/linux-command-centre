<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Sun, Moon, Monitor } from 'lucide-svelte'

  type DisplayStatus = {
    brightness: number | null
    nightLight: boolean
    nightLightTemp: number
  }

  let status = $state<DisplayStatus | null>(null)
  let loading = $state(true)
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { status = await invoke<DisplayStatus>('display:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setBrightness(v: number) {
    if (!status) return
    status = { ...status, brightness: v }
    try { await invoke('display:setBrightness', v) }
    catch (e) { error = String(e) }
  }

  async function toggleNightLight() {
    if (!status) return
    const next = !status.nightLight
    status = { ...status, nightLight: next }
    try { await invoke('display:setNightLight', next) }
    catch (e) { error = String(e); await load() }
  }

  async function setNightLightTemp(v: number) {
    if (!status) return
    status = { ...status, nightLightTemp: v }
    try { await invoke('display:setNightLightTemp', v) }
    catch (e) { error = String(e) }
  }

  onMount(load)
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}

    <!-- Brightness -->
    {#if status.brightness !== null}
    <div class="rounded-xl border border-border bg-card p-5 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Sun size={15} />
        Brightness — {status.brightness}%
      </div>
      <input
        type="range" min="1" max="100" step="1"
        value={status.brightness}
        oninput={(e) => setBrightness(parseInt((e.target as HTMLInputElement).value))}
        class="w-full accent-primary"
      />
      <div class="flex justify-between">
        {#each [25, 50, 75, 100] as p}
          <button
            onclick={() => setBrightness(p)}
            class="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >{p}%</button>
        {/each}
      </div>
    </div>
    {/if}

    <!-- Night Light -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-medium">
          <Moon size={15} />
          Night light
        </div>
        <button
          onclick={toggleNightLight} aria-label="Toggle night light"
          class={`relative w-11 h-6 rounded-full transition-colors ${status.nightLight ? 'bg-primary' : 'bg-secondary'}`}
        >
          <span class={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${status.nightLight ? 'translate-x-5' : ''}`}></span>
        </button>
      </div>

      {#if status.nightLight}
      <div class="space-y-1.5">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Colour temperature</span>
          <span>{status.nightLightTemp}K</span>
        </div>
        <input
          type="range" min="1700" max="4700" step="100"
          value={status.nightLightTemp}
          oninput={(e) => setNightLightTemp(parseInt((e.target as HTMLInputElement).value))}
          class="w-full accent-primary"
        />
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Warm</span>
          <span>Cool</span>
        </div>
      </div>
      {/if}
    </div>

    <!-- HiDPI note -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Monitor size={12} />
        HiDPI scaling
      </div>
      <p class="text-xs text-muted-foreground">
        Manage via GNOME Settings → Displays, or
        <code class="bg-secondary px-1 rounded text-[10px]">huawei display scale 1.5</code>
      </p>
    </div>

    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  {/if}
</div>
