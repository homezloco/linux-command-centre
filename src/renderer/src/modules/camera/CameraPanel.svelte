<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle, EmptyState } from '$ui'
  import { RefreshCw, Camera, CameraOff, Eye, EyeOff, AlertTriangle, CheckCircle2, XCircle, SlidersHorizontal } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

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
  type HwCheck = { id: string; label: string; state: 'ok' | 'warn' | 'fail' | 'info'; detail: string }

  const TITLE = 'Camera'
  const IPU6_CHECK_IDS = ['mod-intel_ipu6', 'mod-ipu_bridge', 'mod-intel_skl_int3472', 'mod-gc2607', 'acpi-camera', 'camera-hal']

  let status     = $state<CameraStatus | null>(null)
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let isHuawei   = $state(false)
  let ipu6Checks = $state<HwCheck[]>([])

  // Local control values (optimistic updates)
  let localCtrls = $state<Record<string, number>>({})

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      const [s, devInfo, hwChecks] = await Promise.all([
        invoke<CameraStatus>('camera:status'),
        invoke<{ isHuawei: boolean }>('device:info'),
        invoke<HwCheck[]>('device:hardwareStatus'),
      ])
      status = s
      isHuawei = devInfo.isHuawei
      ipu6Checks = hwChecks.filter(c => IPU6_CHECK_IDS.includes(c.id))
      const ctrls: Record<string, number> = {}
      for (const cam of s.cameras) {
        for (const c of cam.controls) ctrls[`${cam.node}:${c.id}`] = c.value
      }
      localCtrls = ctrls
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function pushControl(node: string, id: string, value: number) {
    try { await invoke('camera:setControl', node, id, value) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert to what the driver reports
    }
  }

  // One debounced pusher per control so two sliders never coalesce
  const pushers = new Map<string, (v: number) => void>()
  function setControl(node: string, id: string, value: number, immediate = false) {
    const key = `${node}:${id}`
    localCtrls = { ...localCtrls, [key]: value }
    if (immediate) { void pushControl(node, id, value); return }
    let push = pushers.get(key)
    if (!push) {
      push = debounce((v: number) => { void pushControl(node, id, v) })
      pushers.set(key, push)
    }
    push(value)
  }

  function ctrlVal(node: string, id: string, fallback: number): number {
    return localCtrls[`${node}:${id}`] ?? fallback
  }

  function checkColor(state: HwCheck['state']): string {
    if (state === 'ok') return 'text-status-ok'
    if (state === 'warn') return 'text-status-warn'
    if (state === 'fail') return 'text-status-fail'
    return 'text-muted-foreground'
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh camera status"
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
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-32 w-full" />

    {:else if status}
      {#if !status.v4l2Present}
        <Alert variant="warn" message="v4l-utils is not installed — install it with: sudo apt install v4l-utils" />
      {/if}

      {#if status.cameras.length === 0}
        <EmptyState
          icon={CameraOff}
          title="No camera devices found"
          message={status.ipu6Loaded && !status.halInstalled
            ? 'Intel IPU6 module loaded but the HAL is not installed — install libcamera-tools or the ipu6-camera-hal package.'
            : 'No V4L2 video device is present.'}
        />

      {:else}
        {#each status.cameras as cam (cam.node)}
          <!-- Privacy banner -->
          <Card class="flex items-center gap-3 {cam.inUse ? 'border-status-ok/40 bg-status-ok/10' : ''}">
            {#if cam.inUse}
              <Eye size={18} class="text-status-ok shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium text-status-ok">Camera is in use</p>
                <p class="text-xs text-muted-foreground">PID {cam.usingPids.join(', ')}</p>
              </div>
            {:else}
              <EyeOff size={18} class="text-muted-foreground shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium">Camera is not in use</p>
                <p class="text-xs text-muted-foreground">No application is currently accessing the camera</p>
              </div>
            {/if}
          </Card>

          <!-- Device info -->
          <Card class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-md bg-pink-500/10 text-pink-400 flex items-center justify-center shrink-0">
              <Camera size={15} />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-medium leading-tight">{cam.name}</p>
              <p class="text-xs text-muted-foreground font-mono mt-0.5">{cam.node} · {cam.driver}</p>
              {#if cam.bus}
                <p class="text-xs text-muted-foreground mt-1">Bus: <span class="font-mono">{cam.bus}</span></p>
              {/if}
            </div>
          </Card>

          <!-- Formats & resolutions -->
          {#if cam.formats.length > 0}
            <Card class="space-y-3">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Eye size={13} />
                </div>
                <p class="text-[13px] font-medium">Supported formats</p>
              </div>
              {@const withRes = cam.formats.filter(f => f.resolutions.length > 0)}
              {@const bare = cam.formats.filter(f => f.resolutions.length === 0)}
              <div class="space-y-2">
                {#each withRes as fmt (fmt.codec)}
                  <div>
                    <p class="text-xs font-mono font-medium text-muted-foreground mb-1">{fmt.codec}</p>
                    <div class="flex flex-wrap gap-1.5">
                      {#each fmt.resolutions as res, i (i)}
                        <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary/50 border border-border/50">
                          {res.w}×{res.h}{res.fps > 0 ? ` @ ${res.fps}fps` : ''}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/each}
                {#if bare.length > 0}
                  <!-- Formats that advertise no discrete resolutions (e.g. v4l2loopback) -->
                  <div class="flex flex-wrap gap-1.5">
                    {#each bare as fmt (fmt.codec)}
                      <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary/50 border border-border/50 text-muted-foreground">{fmt.codec}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </Card>
          {/if}

          <!-- Controls -->
          {#if cam.controls.length > 0}
            <Card class="space-y-4">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md bg-orange-500/10 text-orange-400 flex items-center justify-center">
                  <SlidersHorizontal size={12} />
                </div>
                <p class="text-[13px] font-medium">Camera controls</p>
              </div>

              {#each cam.controls as ctrl (ctrl.id)}
                {@const val = ctrlVal(cam.node, ctrl.id, ctrl.value)}
                {@const inputId = `cam-${cam.node.replace(/\W/g, '-')}-${ctrl.id}`}
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <label for={inputId} class="capitalize text-muted-foreground" id="{inputId}-label">{ctrl.name}</label>
                    {#if ctrl.type === 'bool'}
                      <Toggle
                        checked={val !== 0}
                        aria-labelledby="{inputId}-label"
                        onCheckedChange={(v) => setControl(cam.node, ctrl.id, v ? 1 : 0, true)}
                      />
                    {:else}
                      <span class="tabular-nums font-medium">{val}</span>
                    {/if}
                  </div>
                  {#if ctrl.type !== 'bool' && ctrl.max > ctrl.min}
                    <input
                      id={inputId}
                      type="range"
                      min={ctrl.min} max={ctrl.max} step={ctrl.step}
                      value={val}
                      oninput={(e) => setControl(cam.node, ctrl.id, parseInt((e.target as HTMLInputElement).value))}
                      class="w-full accent-primary"
                    />
                    <div class="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                      <span>{ctrl.min}</span>
                      <span>default: {ctrl.default}</span>
                      <span>{ctrl.max}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </Card>
          {:else}
            <Card>
              <div class="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 size={14} class="text-status-ok" />
                <p class="text-[13px]">No adjustable controls on this device</p>
              </div>
              <p class="text-xs text-muted-foreground mt-1 ml-5">
                Camera controls (brightness, contrast, etc.) are managed by the driver or libcamera.
              </p>
            </Card>
          {/if}
        {/each}
      {/if}

      <!-- IPU6 pipeline (Huawei / Intel IPU6 machines) -->
      {#if isHuawei && ipu6Checks.length > 0}
        <Card class="space-y-2">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Intel IPU6 pipeline</p>
          <div class="space-y-1.5">
            {#each ipu6Checks as check (check.id)}
              <div class="flex items-center gap-2.5 text-xs">
                {#if check.state === 'ok'}
                  <CheckCircle2 size={12} class="shrink-0 {checkColor(check.state)}" />
                {:else if check.state === 'warn'}
                  <AlertTriangle size={12} class="shrink-0 {checkColor(check.state)}" />
                {:else if check.state === 'fail'}
                  <XCircle size={12} class="shrink-0 {checkColor(check.state)}" />
                {:else}
                  <AlertTriangle size={12} class="shrink-0 {checkColor(check.state)}" />
                {/if}
                <span class="font-mono text-muted-foreground w-44 shrink-0 truncate">{check.label}</span>
                <span class="text-muted-foreground truncate">{check.detail}</span>
              </div>
            {/each}
          </div>
          <p class="text-[11px] text-muted-foreground pt-1">Full diagnostics on Home</p>
        </Card>
      {:else if status.ipu6Loaded}
        <Card class="flex items-center gap-3 text-xs">
          <CheckCircle2 size={13} class="text-status-ok shrink-0" />
          <span class="text-muted-foreground">Intel IPU6 module loaded · HAL {status.halInstalled ? 'found' : 'not installed'}</span>
        </Card>
      {/if}
    {/if}
  </div>
</Page>
