<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox, EmptyState } from '$ui'
  import { RefreshCw, AppWindow } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type AppOption = { id: string; name: string }
  type Category  = { id: string; label: string; current: string; currentName: string; apps: AppOption[] }

  const TITLE = 'Default Apps'

  let categories = $state<Category[]>([])
  let loading    = $state(true)
  let refreshing = $state(false)
  let error      = $state('')
  let saving     = $state<string | null>(null)

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try { categories = await invoke<Category[]>('defaultapps:list') }
    catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function setDefault(cat: Category, desktopFile: string) {
    if (desktopFile === cat.current) return
    saving = cat.id
    try {
      await invoke('defaultapps:set', cat.id, desktopFile)
      const name = cat.apps.find(a => a.id === desktopFile)?.name ?? desktopFile
      toasts.success(`${cat.label}: ${name}`, TITLE)
      await load(true)
    } catch (e) {
      toasts.error(String(e), TITLE)
      await load(true)
    }
    finally { saving = null }
  }

  function optionsFor(cat: Category) {
    const opts = cat.apps.map(a => ({ value: a.id, label: a.name }))
    // Keep an unlisted current handler selectable
    if (cat.current && !opts.some(o => o.value === cat.current)) {
      opts.unshift({ value: cat.current, label: cat.currentName || cat.current })
    }
    return opts
  }

  onMount(() => { void load() })
</script>

<Page width="wide">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Refresh default apps"
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
      <Card padding="none">
        {#each [0, 1, 2, 3, 4] as i (i)}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0">
            <Skeleton class="h-3 w-28 shrink-0" />
            <Skeleton class="h-8 flex-1" />
          </div>
        {/each}
      </Card>

    {:else if categories.length === 0}
      <EmptyState icon={AppWindow} title="No application categories" message="xdg-mime reported nothing to configure." />

    {:else}
      <Card padding="none" class="divide-y divide-border overflow-hidden">
        {#each categories as cat (cat.id)}
          {@const opts = optionsFor(cat)}
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <label for="defaultapp-{cat.id}" class="text-[13px] font-medium w-32 shrink-0">{cat.label}</label>
            <div class="flex-1 min-w-0">
              {#if opts.length === 0}
                <p class="text-xs text-muted-foreground">No applications found for this type</p>
              {:else}
                <Listbox
                  id="defaultapp-{cat.id}"
                  value={cat.current}
                  options={opts}
                  placeholder="Not set"
                  disabled={saving === cat.id}
                  onChange={(v) => setDefault(cat, v)}
                />
              {/if}
            </div>
          </div>
        {/each}
      </Card>

      <p class="text-xs text-muted-foreground px-1">
        Changes apply immediately via xdg-mime. Some apps may require re-login to take effect.
      </p>
    {/if}
  </div>
</Page>
