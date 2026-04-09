<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Zap, Battery, Gauge } from 'lucide-svelte'

  type PowerStatus = { profile: string; profiles: string[] }

  const profileMeta: Record<string, { label: string; desc: string; icon: typeof Zap }> = {
    'balanced':     { label: 'Balanced',     desc: 'Good performance with reasonable battery life', icon: Gauge },
    'performance':  { label: 'Performance',  desc: 'Maximum speed, higher power draw',              icon: Zap },
    'power-saver':  { label: 'Power Saver',  desc: 'Extend battery life, reduced performance',      icon: Battery },
  }

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

  onMount(load)
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}
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
    {#if error}<p class="text-xs text-destructive mt-2">{error}</p>{/if}
  {/if}
</div>
