<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox } from '$ui'
  import { Volume2, VolumeX, Volume1, Mic, Speaker, RefreshCw } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

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

  const TITLE = 'Audio'

  let status = $state<AudioStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error = $state('')

  const sinkOptions = $derived((status?.sinks ?? []).map(s => ({ value: s.id, label: s.description })))
  const sourceOptions = $derived((status?.sources ?? []).map(s => ({ value: s.id, label: s.description })))
  const defaultSinkId = $derived(status?.sinks.find(s => s.isDefault)?.id ?? status?.defaultSink ?? '')
  const defaultSourceId = $derived(status?.sources.find(s => s.isDefault)?.id ?? status?.defaultSource ?? '')

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<AudioStatus>('audio:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  function fail(e: unknown) {
    toasts.error(String(e), TITLE)
    void load(true)
  }

  const pushVolume = debounce((v: number) => {
    invoke('audio:setVolume', v).catch(fail)
  })
  function setVolume(v: number) {
    if (!status) return
    status = { ...status, volume: v }
    pushVolume(v)
  }

  async function toggleMute() {
    try { await invoke('audio:toggleMute'); await load(true) }
    catch (e) { fail(e) }
  }

  async function setDefaultSink(id: string) {
    try { await invoke('audio:setDefaultSink', id); await load(true) }
    catch (e) { fail(e) }
  }

  async function setDefaultSource(id: string) {
    try { await invoke('audio:setDefaultSource', id); await load(true) }
    catch (e) { fail(e) }
  }

  // One debounced pusher per stream so dragging two sliders never coalesces
  const streamPushers = new Map<string, (volume: number) => void>()
  function pushStreamVolume(id: string, volume: number) {
    let push = streamPushers.get(id)
    if (!push) {
      push = debounce((v: number) => { invoke('audio:setStreamVolume', id, v).catch(fail) })
      streamPushers.set(id, push)
    }
    push(volume)
  }
  function setStreamVolume(id: string, volume: number) {
    if (!status) return
    status = { ...status, streams: status.streams.map(s => s.id === id ? { ...s, volume } : s) }
    pushStreamVolume(id, volume)
  }

  async function toggleStreamMute(id: string, muted: boolean) {
    if (!status) return
    status = { ...status, streams: status.streams.map(s => s.id === id ? { ...s, muted: !muted } : s) }
    try { await invoke('audio:setStreamMute', id, !muted) }
    catch (e) { fail(e) }
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh audio devices"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-3">
    {#if error}
      <Alert message={error} />
    {/if}

    {#if loading}
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-32 w-full" />

    {:else if status}
      <!-- Output device -->
      <Card class="space-y-3">
        <label for="audio-output" class="flex items-center gap-2.5 text-[13px] font-medium">
          <div class="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Speaker size={13} />
          </div>
          Output
        </label>
        {#if sinkOptions.length > 0}
          <Listbox id="audio-output" value={defaultSinkId} options={sinkOptions} onChange={(v) => setDefaultSink(v)} />
        {:else}
          <p class="text-xs text-muted-foreground">No output devices</p>
        {/if}
      </Card>

      <!-- Input device -->
      <Card class="space-y-3">
        <label for="audio-input" class="flex items-center gap-2.5 text-[13px] font-medium">
          <div class="w-7 h-7 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
            <Mic size={13} />
          </div>
          Input
        </label>
        {#if sourceOptions.length > 0}
          <Listbox id="audio-input" value={defaultSourceId} options={sourceOptions} onChange={(v) => setDefaultSource(v)} />
        {:else}
          <p class="text-xs text-muted-foreground">No input devices</p>
        {/if}
      </Card>

      <!-- Master volume -->
      <Card class="p-5 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            {#if status.muted || status.volume === 0}
              <VolumeX size={26} class="text-muted-foreground" />
            {:else if status.volume < 50}
              <Volume1 size={26} class="text-primary" />
            {:else}
              <Volume2 size={26} class="text-primary" />
            {/if}
            <div>
              <p class="text-[13px] font-medium tabular-nums">{status.muted ? 'Muted' : `${status.volume}%`}</p>
              <label for="audio-master" class="text-xs text-muted-foreground">Master volume</label>
            </div>
          </div>
          <Button variant="secondary" size="sm" onclick={toggleMute}>
            {status.muted ? 'Unmute' : 'Mute'}
          </Button>
        </div>
        <div class="space-y-1.5">
          <input
            id="audio-master"
            type="range" min="0" max="100" step="1"
            value={status.volume}
            oninput={(e) => setVolume(parseInt((e.target as HTMLInputElement).value))}
            class="w-full accent-primary"
          />
          <div class="flex justify-between">
            {#each [25, 50, 75, 100] as preset (preset)}
              <Button variant="ghost" size="sm" class="text-xs text-muted-foreground px-1.5" onclick={() => setVolume(preset)}>{preset}%</Button>
            {/each}
          </div>
        </div>
      </Card>

      <!-- Per-application volume -->
      {#if status.streams.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-[13px] font-medium">Application volume</p>
          </div>
          <div class="divide-y divide-border">
            {#each status.streams as stream (stream.id)}
              <div class="px-4 py-3 space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <label for="stream-{stream.id}" class="flex items-center gap-2 min-w-0">
                    <span class="text-[13px] truncate">{stream.appName || stream.name}</span>
                    {#if stream.muted}
                      <VolumeX size={12} class="text-muted-foreground shrink-0" />
                    {/if}
                  </label>
                  <Button variant="ghost" size="sm" class="text-xs text-muted-foreground" onclick={() => toggleStreamMute(stream.id, stream.muted)}>
                    {stream.muted ? 'Unmute' : 'Mute'}
                  </Button>
                </div>
                <input
                  id="stream-{stream.id}"
                  type="range" min="0" max="100" step="1"
                  value={stream.volume}
                  oninput={(e) => setStreamVolume(stream.id, parseInt((e.target as HTMLInputElement).value))}
                  class="w-full accent-primary h-1"
                />
              </div>
            {/each}
          </div>
        </Card>
      {/if}
    {/if}
  </div>
</Page>
