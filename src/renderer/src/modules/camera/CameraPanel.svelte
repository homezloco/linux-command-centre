<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Camera, CameraOff, Eye, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-svelte'

  type Resolution  = { w: number; h: number; fps: number }
  type CameraFmt   = { codec: string; resolutions: Resolution[] }
  type CameraCtrl  = { id: string; name: string; type: string; min: number; max: number; step: number; value: number; default: number }
  type CameraDevice = {
    node: string; name: string; driver: string; bus: string
    inUse: boolean; usingPids: string[]
    formats: CameraFmt[]; controls: CameraCtrl[]
  }
  type CameraStatus = {
    v4l2Present: boolean
    cameras: CameraDevice[]
    ipu6Loaded: boolean
    halInstalled: boolean
  }

  let status     = $state<CameraStatus | null>(null)
  let loading    = $state(true)
  let error      = $state('')
  let ctrlError  = $state('')

  // Local control values (optimistic updates)
  let localCtrls = $state<Record<string, number>>({})

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<CameraStatus>('camera:status')
      // Seed local control values from device state
      const ctrls: Record<string, number> = {}
      for (const cam of status.cameras) {
        for (const c of cam.controls) ctrls[`${cam.node}:${c.id}`] = c.value
      }
      localCtrls = ctrls
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setControl(node: string, id: string, value: number) {
    localCtrls = { ...localCtrls, [`${node}:${id}`]: value }
    ctrlError = ''
    try { await invoke('camera:setControl', node, id, value) }
    catch (e) { ctrlError = String(e) }
  }

  function ctrlVal(node: string, id: string, fallback: number): number {
    return localCtrls[`${node}:${id}`] ?? fallback
  }

  onMount(() => load())
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else if error}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- v4l2-ctl missing -->
    {#if !status.v4l2Present}
      <div class="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4 flex items-start gap-3">
        <AlertTriangle size={16} class="text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-medium text-yellow-400">v4l-utils not installed</p>
          <p class="text-xs text-muted-foreground mt-1">Install with: <code class="font-mono bg-secondary px-1 rounded">sudo apt install v4l-utils</code></p>
        </div>
      </div>
    {/if}

    <!-- No cameras found -->
    {#if status.cameras.length === 0}
      <div class="rounded-xl border border-border bg-card p-8 text-center space-y-2">
        <CameraOff size={32} class="mx-auto text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No camera devices found</p>
        {#if status.ipu6Loaded && !status.halInstalled}
          <p class="text-xs text-muted-foreground/70">Intel IPU6 module loaded but HAL not installed.<br/>
            Install <code class="font-mono bg-secondary px-1 rounded">libcamera-tools</code> or the ipu6-camera-hal package.</p>
        {/if}
      </div>

    {:else}
      {#each status.cameras as cam}
        <!-- Privacy banner -->
        <div class="rounded-xl border p-4 flex items-center gap-3
                    {cam.inUse ? 'border-green-500/40 bg-green-500/10' : 'border-border bg-card'}">
          {#if cam.inUse}
            <Eye size={18} class="text-green-400 shrink-0" />
            <div class="flex-1">
              <p class="text-sm font-medium text-green-400">Camera is in use</p>
              <p class="text-xs text-muted-foreground">PID {cam.usingPids.join(', ')}</p>
            </div>
          {:else}
            <EyeOff size={18} class="text-muted-foreground shrink-0" />
            <div class="flex-1">
              <p class="text-sm font-medium">Camera is not in use</p>
              <p class="text-xs text-muted-foreground">No application is currently accessing the camera</p>
            </div>
          {/if}
          <button
            onclick={load}
            aria-label="Refresh camera status"
            class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <!-- Device info -->
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Camera size={16} />
            </div>
            <div>
              <p class="text-sm font-medium">{cam.name}</p>
              <p class="text-xs text-muted-foreground font-mono">{cam.node} · {cam.driver}</p>
            </div>
          </div>

          {#if cam.bus}
            <p class="text-xs text-muted-foreground">Bus: <span class="font-mono">{cam.bus}</span></p>
          {/if}
        </div>

        <!-- Formats & resolutions -->
        {#if cam.formats.length > 0}
          <div class="rounded-xl border border-border bg-card p-4 space-y-3">
            <p class="text-sm font-medium">Supported Formats</p>
            <div class="space-y-2">
              {#each cam.formats as fmt}
                <div>
                  <p class="text-xs font-mono font-medium text-muted-foreground mb-1">{fmt.codec}</p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each fmt.resolutions as res}
                      <span class="text-xs font-mono px-2 py-0.5 rounded bg-secondary border border-border">
                        {res.w}×{res.h}{res.fps > 0 ? ` @ ${res.fps}fps` : ''}
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Controls -->
        {#if cam.controls.length > 0}
          <div class="rounded-xl border border-border bg-card p-4 space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">Camera Controls</p>
              {#if ctrlError}
                <p class="text-xs text-destructive">{ctrlError}</p>
              {/if}
            </div>

            {#each cam.controls as ctrl}
              {@const val = ctrlVal(cam.node, ctrl.id, ctrl.value)}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                  <span class="capitalize text-muted-foreground">{ctrl.name}</span>
                  {#if ctrl.type === 'bool'}
                    <button
                      onclick={() => setControl(cam.node, ctrl.id, val ? 0 : 1)}
                      aria-label="Toggle {ctrl.name}"
                      class="relative w-9 h-5 rounded-full transition-colors shrink-0
                             {val ? 'bg-primary' : 'bg-secondary border border-border'}"
                    >
                      <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                                   {val ? 'translate-x-4' : ''}"></span>
                    </button>
                  {:else}
                    <span class="tabular-nums font-medium">{val}</span>
                  {/if}
                </div>
                {#if ctrl.type !== 'bool' && ctrl.max > ctrl.min}
                  <input
                    type="range"
                    min={ctrl.min} max={ctrl.max} step={ctrl.step}
                    value={val}
                    oninput={(e) => setControl(cam.node, ctrl.id, parseInt((e.target as HTMLInputElement).value))}
                    class="w-full accent-primary"
                  />
                  <div class="flex justify-between text-[10px] text-muted-foreground/50">
                    <span>{ctrl.min}</span>
                    <span>default: {ctrl.default}</span>
                    <span>{ctrl.max}</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 size={14} class="text-green-400" />
              <p class="text-sm">No adjustable controls on this device</p>
            </div>
            <p class="text-xs text-muted-foreground mt-1 ml-5">
              Camera controls (brightness, contrast, etc.) are managed by the driver or libcamera.
            </p>
          </div>
        {/if}
      {/each}
    {/if}

    <!-- ipu6 diagnostic -->
    {#if status.ipu6Loaded}
      <div class="rounded-xl border border-border bg-card p-4 space-y-2">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Intel IPU6 Diagnostics</p>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex items-center gap-2">
            {#if status.ipu6Loaded}
              <CheckCircle2 size={12} class="text-green-400" />
            {:else}
              <AlertTriangle size={12} class="text-yellow-400" />
            {/if}
            <span class="text-muted-foreground">Kernel module</span>
          </div>
          <div class="flex items-center gap-2">
            {#if status.halInstalled}
              <CheckCircle2 size={12} class="text-green-400" />
            {:else}
              <AlertTriangle size={12} class="text-yellow-400" />
            {/if}
            <span class="text-muted-foreground">Camera HAL {status.halInstalled ? 'found' : 'not found'}</span>
          </div>
        </div>
      </div>
    {/if}

  </div>
{/if}
