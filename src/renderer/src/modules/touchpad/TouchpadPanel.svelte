<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { Mouse, CheckCircle, XCircle, RefreshCw } from 'lucide-svelte'

  type TouchpadStatus = { detected: boolean; serviceEnabled: boolean }

  let status = $state<TouchpadStatus | null>(null)
  let loading = $state(true)
  let rebinding = $state(false)
  let rebindMsg = $state('')
  let error = $state('')

  async function load() {
    loading = true; error = ''
    try { status = await invoke<TouchpadStatus>('touchpad:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function rebind() {
    rebinding = true; rebindMsg = ''; error = ''
    try {
      await invoke('touchpad:rebind')
      rebindMsg = 'Rebound successfully — test your touchpad.'
      await load()
    } catch (e) { error = String(e) }
    finally { rebinding = false }
  }

  onMount(load)
</script>

<div class="max-w-sm space-y-3">
  {#if loading}
    <div class="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
  {:else if status}

    <div class="rounded-xl border border-border bg-card divide-y divide-border">
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2 text-sm">
          <Mouse size={14} class="text-muted-foreground" />
          GXTP7863 detected
        </div>
        {#if status.detected}
          <CheckCircle size={16} class="text-green-400" />
        {:else}
          <XCircle size={16} class="text-red-400" />
        {/if}
      </div>
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2 text-sm">
          <RefreshCw size={14} class="text-muted-foreground" />
          Rebind service at boot
        </div>
        {#if status.serviceEnabled}
          <CheckCircle size={16} class="text-green-400" />
        {:else}
          <XCircle size={16} class="text-yellow-400" />
        {/if}
      </div>
    </div>

    <!-- Rebind action -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium">Force rebind</p>
      <p class="text-xs text-muted-foreground">
        If the touchpad is frozen or unresponsive, rebinding forces the kernel driver to
        reinitialise it without rebooting.
      </p>
      <button
        onclick={rebind}
        disabled={rebinding}
        class="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground
               text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={13} class={rebinding ? 'animate-spin' : ''} />
        {rebinding ? 'Rebinding…' : 'Rebind now'}
      </button>
      {#if rebindMsg}<p class="text-xs text-green-400">{rebindMsg}</p>{/if}
      {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    </div>

  {/if}
</div>
