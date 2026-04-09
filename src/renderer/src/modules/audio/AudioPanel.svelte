<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Volume2, VolumeX, Volume1 } from 'lucide-svelte'

  type AudioStatus = { volume: number; muted: boolean }

  let status = $state<AudioStatus | null>(null)
  let loading = $state(true)
  let pending = $state(false)
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { status = await invoke<AudioStatus>('audio:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setVolume(v: number) {
    if (!status) return
    status = { ...status, volume: v }
    pending = true
    try { await invoke('audio:setVolume', v) }
    catch (e) { error = String(e) }
    finally { pending = false }
  }

  async function toggleMute() {
    pending = true; error = ''
    try { await invoke('audio:toggleMute'); await load() }
    catch (e) { error = String(e) }
    finally { pending = false }
  }

  onMount(load)
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}
    <div class="rounded-xl border border-border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          {#if status.muted || status.volume === 0}
            <VolumeX size={26} class="text-muted-foreground" />
          {:else if status.volume < 50}
            <Volume1 size={26} class="text-primary" />
          {:else}
            <Volume2 size={26} class="text-primary" />
          {/if}
          <div>
            <p class="font-medium">{status.muted ? 'Muted' : `${status.volume}%`}</p>
            <p class="text-sm text-muted-foreground">Default sink · PipeWire</p>
          </div>
        </div>
        <button
          onclick={toggleMute} disabled={pending}
          class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary
                 transition-colors disabled:opacity-50"
        >
          {status.muted ? 'Unmute' : 'Mute'}
        </button>
      </div>

      <!-- Volume slider -->
      <div class="space-y-1.5">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Volume</span>
          <span>{status.volume}%</span>
        </div>
        <input
          type="range" min="0" max="100" step="1"
          value={status.volume}
          oninput={(e) => setVolume(parseInt((e.target as HTMLInputElement).value))}
          class="w-full accent-primary"
        />
        <div class="flex justify-between">
          {#each [25, 50, 75, 100] as preset}
            <button
              onclick={() => setVolume(preset)}
              class="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >{preset}%</button>
          {/each}
        </div>
      </div>

      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>
  {/if}
</div>
