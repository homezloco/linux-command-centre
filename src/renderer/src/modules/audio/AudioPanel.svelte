<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import {
    Volume2, VolumeX, Volume1, Headphones, Mic,
    ChevronDown, Speaker, Monitor
  } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type AudioDevice = {
    id: string
    name: string
    description: string
    isDefault: boolean
  }

  type AudioStream = {
    id: string
    name: string
    appName: string
    volume: number
    muted: boolean
    sinkId: string
  }

  type AudioStatus = {
    volume: number
    muted: boolean
    defaultSink: string | null
    defaultSource: string | null
    sinks: AudioDevice[]
    sources: AudioDevice[]
    streams: AudioStream[]
  }

  let status = $state<AudioStatus | null>(null)
  let loading = $state(true)
  let error = $state('')

  // Active section
  let showOutputSelect = $state(false)
  let showInputSelect = $state(false)

  async function load() {
    loading = true; error = ''
    try { status = await invoke<AudioStatus>('audio:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setVolume(v: number) {
    if (!status) return
    status = { ...status, volume: v }
    try { await invoke('audio:setVolume', v) }
    catch (e) { error = String(e) }
  }

  async function toggleMute() {
    try { await invoke('audio:toggleMute'); await load() }
    catch (e) { error = String(e) }
  }

  async function setDefaultSink(id: string) {
    try { await invoke('audio:setDefaultSink', id); showOutputSelect = false; await load() }
    catch (e) { error = String(e) }
  }

  async function setDefaultSource(id: string) {
    try { await invoke('audio:setDefaultSource', id); showInputSelect = false; await load() }
    catch (e) { error = String(e) }
  }

  async function setStreamVolume(id: string, volume: number) {
    try {
      await invoke('audio:setStreamVolume', id, volume)
      if (status) {
        status = { ...status, streams: status.streams.map(s => s.id === id ? { ...s, volume } : s) }
      }
    } catch (e) { error = String(e) }
  }

  async function toggleStreamMute(id: string, muted: boolean) {
    try {
      await invoke('audio:setStreamMute', id, !muted)
      if (status) {
        status = { ...status, streams: status.streams.map(s => s.id === id ? { ...s, muted: !muted } : s) }
      }
    } catch (e) { error = String(e) }
  }

  function deviceIcon(desc: string) {
    const d = desc.toLowerCase()
    if (d.includes('headphone') || d.includes('headset')) return Headphones
    if (d.includes('mic')) return Mic
    if (d.includes('hdmi') || d.includes('display')) return Monitor
    return Speaker
  }

  onMount(load)
</script>

{#if loading}
  <Spinner />
{:else if error && !status}
  <Alert message={error} />
{:else if status}
<div class="max-w-md space-y-3">

    <!-- Output Device -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 text-sm font-medium">
          <div class="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Speaker size={13} />
          </div>
          Output
        </div>
        <button onclick={() => showOutputSelect = !showOutputSelect} class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <span class="truncate max-w-[150px]">{status.sinks.find(s => s.isDefault)?.description || 'Select'}</span>
          <ChevronDown size={14} class={showOutputSelect ? 'rotate-180' : ''} />
        </button>
      </div>
      {#if showOutputSelect}
        <div class="divide-y divide-border border-t border-border -mx-4 px-4 pt-2">
          {#each status.sinks as sink}
            {@const Icon = deviceIcon(sink.description)}
            <button onclick={() => setDefaultSink(sink.id)} class="w-full flex items-center gap-3 py-2 text-left hover:text-primary transition-colors">
              <Icon size={14} class={sink.isDefault ? 'text-primary' : 'text-muted-foreground'} />
              <span class="text-sm {sink.isDefault ? 'font-medium text-primary' : ''}">{sink.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Input Device -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5 text-sm font-medium">
          <div class="w-7 h-7 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
            <Mic size={13} />
          </div>
          Input
        </div>
        <button onclick={() => showInputSelect = !showInputSelect} class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <span class="truncate max-w-[150px]">{status.sources.find(s => s.isDefault)?.description || 'Select'}</span>
          <ChevronDown size={14} class={showInputSelect ? 'rotate-180' : ''} />
        </button>
      </div>
      {#if showInputSelect}
        <div class="divide-y divide-border border-t border-border -mx-4 px-4 pt-2">
          {#each status.sources as source}
            <button onclick={() => setDefaultSource(source.id)} class="w-full flex items-center gap-3 py-2 text-left hover:text-primary transition-colors">
              <Mic size={14} class={source.isDefault ? 'text-primary' : 'text-muted-foreground'} />
              <span class="text-sm {source.isDefault ? 'font-medium text-primary' : ''}">{source.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Master Volume -->
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
            <p class="text-xs text-muted-foreground">Master Volume</p>
          </div>
        </div>
        <button onclick={toggleMute} class="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors">
          {status.muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <div class="space-y-1.5">
        <input type="range" min="0" max="100" step="1" value={status.volume} oninput={(e) => setVolume(parseInt((e.target as HTMLInputElement).value))} class="w-full accent-primary" />
        <div class="flex justify-between">
          {#each [25, 50, 75, 100] as preset}
            <button onclick={() => setVolume(preset)} class="text-xs text-muted-foreground hover:text-foreground transition-colors">{preset}%</button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Per-Application Volume -->
    {#if status.streams.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <p class="text-sm font-medium">Application Volume</p>
        </div>
        <div class="divide-y divide-border">
          {#each status.streams as stream}
            <div class="px-4 py-3 space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-sm">{stream.appName || stream.name}</span>
                  {#if stream.muted}
                    <VolumeX size={12} class="text-muted-foreground" />
                  {/if}
                </div>
                <button onclick={() => toggleStreamMute(stream.id, stream.muted)} class="text-xs text-muted-foreground hover:text-foreground">
                  {stream.muted ? 'Unmute' : 'Mute'}
                </button>
              </div>
              <input type="range" min="0" max="100" step="1" value={stream.volume} oninput={(e) => setStreamVolume(stream.id, parseInt((e.target as HTMLInputElement).value))} class="w-full accent-primary h-1" />
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if error}<Alert message={error} />{/if}
</div>
{/if}
