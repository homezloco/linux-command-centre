<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Bell, BellOff, Lock } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type NotifStatus = { dnd: boolean; showInLockScreen: boolean }

  let status  = $state<NotifStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)

  async function load() {
    loading = true; error = ''
    try { status = await invoke<NotifStatus>('notifications:status') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function set(opts: Partial<NotifStatus>) {
    if (!status) return
    saving = true; error = ''
    const next = { ...status, ...opts }
    status = next
    try { await invoke('notifications:set', opts) }
    catch (e) { error = String(e); await load() }
    finally { saving = false }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !status}
  <Alert message={error} />

{:else if status}
  <div class="space-y-4 max-w-sm">

    <!-- DND toggle — big and prominent -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl {status.dnd ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}">
            {#if status.dnd}
              <BellOff size={20} />
            {:else}
              <Bell size={20} />
            {/if}
          </div>
          <div>
            <p class="text-sm font-medium">Do Not Disturb</p>
            <p class="text-xs text-muted-foreground">
              {status.dnd ? 'Notifications are silenced' : 'Notifications are shown'}
            </p>
          </div>
        </div>
        {#if saving}
          <RefreshCw size={16} class="animate-spin text-muted-foreground" />
        {:else}
          <button
            onclick={() => set({ dnd: !status!.dnd })}
            aria-label="Toggle Do Not Disturb"
            class="relative w-11 h-6 rounded-full transition-colors
                   {status.dnd ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                         {status.dnd ? 'translate-x-5' : ''}"></span>
          </button>
        {/if}
      </div>

      {#if status.dnd}
        <div class="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
          <p class="text-xs text-primary">Banners and alerts are suppressed. Notifications still appear in the notification list.</p>
        </div>
      {/if}
    </div>

    <!-- Lock screen -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-secondary text-muted-foreground">
            <Lock size={16} />
          </div>
          <div>
            <p class="text-sm font-medium">Lock screen notifications</p>
            <p class="text-xs text-muted-foreground">Show notifications on the lock screen</p>
          </div>
        </div>
        {#if saving}
          <RefreshCw size={16} class="animate-spin text-muted-foreground" />
        {:else}
          <button
            onclick={() => set({ showInLockScreen: !status!.showInLockScreen })}
            aria-label="Toggle lock screen notifications"
            class="relative w-11 h-6 rounded-full transition-colors
                   {status.showInLockScreen ? 'bg-primary' : 'bg-secondary border border-border'}"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                         {status.showInLockScreen ? 'translate-x-5' : ''}"></span>
          </button>
        {/if}
      </div>
    </div>

    {#if error}
      <Alert message={error} />
    {/if}

  </div>
{/if}
