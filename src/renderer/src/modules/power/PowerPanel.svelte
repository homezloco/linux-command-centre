<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox, SegmentedControl } from '$ui'
  import { Zap, Battery, Gauge, Clock, Power, Monitor, RefreshCw } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type PowerStatus = {
    profile: string
    profiles: string[]
    idleDelay: number
    lidCloseAc: string
    lidCloseBattery: string
    powerButton: string
    batteryTime: number | null
    batteryPower: number | null
  }

  const TITLE = 'Power'

  const profileMeta: Record<string, { label: string; desc: string; icon: typeof Zap }> = {
    'balanced':     { label: 'Balanced',     desc: 'Good performance with reasonable battery life', icon: Gauge },
    'performance':  { label: 'Performance',  desc: 'Maximum speed, higher power draw',              icon: Zap },
    'power-saver':  { label: 'Power Saver',  desc: 'Extend battery life, reduced performance',      icon: Battery },
  }

  const LID_ACTIONS = [
    { value: 'nothing', label: 'Do nothing' },
    { value: 'suspend', label: 'Suspend' },
    { value: 'hibernate', label: 'Hibernate' },
    { value: 'interactive', label: 'Ask' },
  ]

  const POWER_BUTTON_ACTIONS = [...LID_ACTIONS, { value: 'poweroff', label: 'Power off' }]

  const IDLE_PRESETS = [0, 60, 120, 300, 600, 900, 1800]

  let status = $state<PowerStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let setting = $state('')
  let error = $state('')

  // Idle presets as a SegmentedControl; a non-preset current value is appended so it still shows as selected
  const idleOptions = $derived.by(() => {
    const presets = IDLE_PRESETS.map(s => ({ value: String(s), label: formatSeconds(s) }))
    if (status && !IDLE_PRESETS.includes(status.idleDelay)) {
      presets.push({ value: String(status.idleDelay), label: formatSeconds(status.idleDelay) })
    }
    return presets
  })

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<PowerStatus>('power:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function setProfile(p: string) {
    setting = p
    try {
      await invoke('power:set', p)
      toasts.success(`Power profile set to ${profileMeta[p]?.label ?? p}`, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
    }
    finally { setting = '' }
  }

  async function gnomeSet(channel: string, args: unknown[], successMsg: string) {
    try {
      await invoke(channel, ...args)
      toasts.success(successMsg, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
      await load(true)
    }
  }

  const setIdleDelay = (seconds: number) =>
    gnomeSet('power:setIdleDelay', [seconds], `Screen blank set to ${formatSeconds(seconds)}`)
  const setLidClose = (ac: string, battery: string) =>
    gnomeSet('power:setLidClose', [ac, battery], 'Lid close action updated')
  const setPowerButton = (action: string) =>
    gnomeSet('power:setPowerButton', [action], 'Power button action updated')

  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  function formatSeconds(seconds: number): string {
    if (seconds === 0) return 'Never'
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh power status"
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
      <Skeleton class="h-16 w-full" />
      <Skeleton class="h-[4.5rem] w-full" />
      <Skeleton class="h-[4.5rem] w-full" />
      <Skeleton class="h-[4.5rem] w-full" />
      <Skeleton class="h-24 w-full" />

    {:else if status}
      <!-- Battery time -->
      {#if status.batteryTime !== null}
        <Card class="flex items-center gap-3">
          <Battery size={22} class="text-status-ok shrink-0" />
          <div>
            <p class="text-[13px] font-medium">{formatTime(status.batteryTime)} remaining</p>
            <p class="text-xs text-muted-foreground">{status.batteryPower}W power draw</p>
          </div>
        </Card>
      {/if}

      <!-- Power profiles -->
      <div class="space-y-2" role="radiogroup" aria-label="Power profile">
        {#each status.profiles as p (p)}
          {@const meta = profileMeta[p] ?? { label: p, desc: '', icon: Zap }}
          {@const Icon = meta.icon}
          <button
            type="button"
            role="radio"
            aria-checked={status.profile === p}
            onclick={() => setProfile(p)}
            disabled={setting !== ''}
            class="w-full rounded-xl border p-4 text-left transition-colors disabled:opacity-60
                   {status.profile === p
                     ? 'border-primary bg-primary/10'
                     : 'border-border bg-card hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'}"
          >
            <div class="flex items-center gap-3">
              <Icon size={18} class={status.profile === p ? 'text-primary' : 'text-muted-foreground'} />
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-medium">{meta.label}</p>
                {#if meta.desc}
                  <p class="text-xs text-muted-foreground">{meta.desc}</p>
                {/if}
              </div>
              {#if status.profile === p}
                <span class="text-xs text-primary font-medium">Active</span>
              {:else if setting === p}
                <span class="text-xs text-muted-foreground">Setting…</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>

      <!-- Screen blank -->
      <Card class="space-y-3">
        <div class="flex items-center gap-2 text-[13px] font-medium">
          <Clock size={15} class="text-muted-foreground" />
          Screen blank after
        </div>
        <SegmentedControl
          value={String(status.idleDelay)}
          options={idleOptions}
          ariaLabel="Screen blank delay"
          onChange={(v) => setIdleDelay(parseInt(v))}
        />
      </Card>

      <!-- Lid close -->
      <Card class="space-y-3">
        <div class="flex items-center gap-2 text-[13px] font-medium">
          <Monitor size={15} class="text-muted-foreground" />
          When lid is closed
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="lid-ac" class="text-xs text-muted-foreground">On AC power</label>
            <Listbox id="lid-ac" value={status.lidCloseAc} options={LID_ACTIONS}
              onChange={(v) => setLidClose(v, status?.lidCloseBattery ?? 'suspend')} />
          </div>
          <div class="space-y-1">
            <label for="lid-bat" class="text-xs text-muted-foreground">On battery</label>
            <Listbox id="lid-bat" value={status.lidCloseBattery} options={LID_ACTIONS}
              onChange={(v) => setLidClose(status?.lidCloseAc ?? 'suspend', v)} />
          </div>
        </div>
      </Card>

      <!-- Power button -->
      <Card class="space-y-3">
        <label for="power-button" class="flex items-center gap-2 text-[13px] font-medium">
          <Power size={15} class="text-muted-foreground" />
          Power button action
        </label>
        <Listbox id="power-button" value={status.powerButton} options={POWER_BUTTON_ACTIONS}
          onChange={(v) => setPowerButton(v)} />
      </Card>
    {/if}
  </div>
</Page>
