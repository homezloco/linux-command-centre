<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Zap, Battery, Gauge, Clock, Power, Monitor } from 'lucide-svelte'

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

  const profileMeta: Record<string, { label: string; desc: string; icon: typeof Zap }> = {
    'balanced':     { label: 'Balanced',     desc: 'Good performance with reasonable battery life', icon: Gauge },
    'performance':  { label: 'Performance',  desc: 'Maximum speed, higher power draw',              icon: Zap },
    'power-saver':  { label: 'Power Saver',  desc: 'Extend battery life, reduced performance',      icon: Battery },
  }

  const lidActions = [
    { value: 'nothing', label: 'Do nothing' },
    { value: 'suspend', label: 'Suspend' },
    { value: 'hibernate', label: 'Hibernate' },
    { value: 'interactive', label: 'Ask' },
  ]

  const powerButtonActions = [
    { value: 'nothing', label: 'Do nothing' },
    { value: 'suspend', label: 'Suspend' },
    { value: 'hibernate', label: 'Hibernate' },
    { value: 'interactive', label: 'Ask' },
    { value: 'poweroff', label: 'Power off' },
  ]

  const idlePresets = [0, 60, 120, 300, 600, 900, 1800]

  let status = $state<PowerStatus | null>(null)
  let loading = $state(true)
  let setting = $state('')
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { status = await invoke<PowerStatus>('power:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setProfile(p: string) {
    setting = p; error = ''
    try { await invoke('power:set', p); await load() }
    catch (e) { error = String(e) }
    finally { setting = '' }
  }

  async function setIdleDelay(seconds: number) {
    try { await invoke('power:setIdleDelay', seconds); await load() }
    catch (e) { error = String(e) }
  }

  async function setLidClose(ac: string, battery: string) {
    try { await invoke('power:setLidClose', ac, battery); await load() }
    catch (e) { error = String(e) }
  }

  async function setPowerButton(action: string) {
    try { await invoke('power:setPowerButton', action); await load() }
    catch (e) { error = String(e) }
  }

  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  onMount(load)
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}

    <!-- Battery Time -->
    {#if status.batteryTime !== null}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-3">
          <Battery size={22} class="text-green-400" />
          <div>
            <p class="text-sm font-medium">{formatTime(status.batteryTime)} remaining</p>
            <p class="text-xs text-muted-foreground">{status.batteryPower}W power draw</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Power Profiles -->
    <div class="space-y-2">
      {#each status.profiles as p}
        {@const meta = profileMeta[p] ?? { label: p, desc: '', icon: Zap }}
        <button
          onclick={() => setProfile(p)}
          disabled={setting !== ''}
          class="w-full rounded-xl border p-4 text-left transition-all disabled:opacity-60
                 {status.profile === p
                   ? 'border-primary bg-primary/10'
                   : 'border-border bg-card hover:bg-secondary/50'}"
        >
          <div class="flex items-center gap-3">
            <meta.icon size={18} class={status.profile === p ? 'text-primary' : 'text-muted-foreground'} />
            <div class="flex-1">
              <p class="text-sm font-medium">{meta.label}</p>
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

    <!-- Screen Blank -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Clock size={15} class="text-muted-foreground" />
        Screen blank after
      </div>
      <div class="flex flex-wrap gap-2">
        {#each idlePresets as preset}
          <button
            onclick={() => setIdleDelay(preset)}
            class="px-3 py-1.5 rounded-md text-xs border transition-colors
                   {status.idleDelay === preset
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-border hover:bg-secondary'}"
          >
            {#if preset === 0}
              Never
            {:else if preset < 60}
              {preset}s
            {:else if preset < 3600}
              {preset / 60}m
            {:else}
              {preset / 3600}h
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Lid Close -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Monitor size={15} class="text-muted-foreground" />
        When lid is closed
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">On AC power</label>
          <select
            value={status.lidCloseAc}
            onchange={(e) => setLidClose((e.target as HTMLSelectElement).value, status.lidCloseBattery)}
            class="w-full text-xs rounded-md border border-border bg-secondary/50 px-2 py-1.5"
          >
            {#each lidActions as action}
              <option value={action.value}>{action.label}</option>
            {/each}
          </select>
        </div>
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">On battery</label>
          <select
            value={status.lidCloseBattery}
            onchange={(e) => setLidClose(status.lidCloseAc, (e.target as HTMLSelectElement).value)}
            class="w-full text-xs rounded-md border border-border bg-secondary/50 px-2 py-1.5"
          >
            {#each lidActions as action}
              <option value={action.value}>{action.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Power Button -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Power size={15} class="text-muted-foreground" />
        Power button action
      </div>
      <div class="flex flex-wrap gap-2">
        {#each powerButtonActions as action}
          <button
            onclick={() => setPowerButton(action.value)}
            class="px-3 py-1.5 rounded-md text-xs border transition-colors
                   {status.powerButton === action.value
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-border hover:bg-secondary'}"
          >
            {action.label}
          </button>
        {/each}
      </div>
    </div>

    {#if error}<p class="text-xs text-destructive mt-2">{error}</p>{/if}
  {/if}
</div>
