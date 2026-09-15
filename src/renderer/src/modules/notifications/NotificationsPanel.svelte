<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Toggle } from '$ui'
  import { RefreshCw, Bell, BellOff, Lock } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type NotifStatus = { dnd: boolean; showInLockScreen: boolean }

  const TITLE = 'Notifications'

  let status  = $state<NotifStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')
  let saving  = $state(false)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { status = await invoke<NotifStatus>('notifications:status') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function set(opts: Partial<NotifStatus>) {
    if (!status) return
    saving = true
    status = { ...status, ...opts }
    try { await invoke('notifications:set', opts) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert to what the desktop actually has
    }
    finally { saving = false }
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh notification settings"
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
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-16 w-full" />

    {:else if status}
      <!-- Do Not Disturb -->
      <Card class="p-5 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="p-2.5 rounded-xl shrink-0 {status.dnd ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}">
              {#if status.dnd}
                <BellOff size={20} />
              {:else}
                <Bell size={20} />
              {/if}
            </div>
            <div class="min-w-0">
              <p class="text-[13px] font-medium" id="notif-dnd-label">Do Not Disturb</p>
              <p class="text-xs text-muted-foreground">
                {status.dnd ? 'Notifications are silenced' : 'Notifications are shown'}
              </p>
            </div>
          </div>
          <Toggle checked={status.dnd} disabled={saving} aria-labelledby="notif-dnd-label" onCheckedChange={(v) => set({ dnd: v })} />
        </div>

        {#if status.dnd}
          <div class="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <p class="text-xs text-primary">Banners and alerts are suppressed. Notifications still appear in the notification list.</p>
          </div>
        {/if}
      </Card>

      <!-- Lock screen -->
      <Card class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-lg bg-secondary text-muted-foreground shrink-0">
            <Lock size={16} />
          </div>
          <div class="min-w-0">
            <p class="text-[13px] font-medium" id="notif-lock-label">Lock screen notifications</p>
            <p class="text-xs text-muted-foreground">Show notifications on the lock screen</p>
          </div>
        </div>
        <Toggle checked={status.showInLockScreen} disabled={saving} aria-labelledby="notif-lock-label" onCheckedChange={(v) => set({ showInLockScreen: v })} />
      </Card>
    {/if}
  </div>
</Page>
