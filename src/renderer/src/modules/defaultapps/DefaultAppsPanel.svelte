<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, ChevronDown, Check } from 'lucide-svelte'
  import Spinner from '$lib/Spinner.svelte'
  import Alert   from '$lib/Alert.svelte'

  type AppOption = { id: string; name: string }
  type Category  = { id: string; label: string; current: string; currentName: string; apps: AppOption[] }

  let categories = $state<Category[]>([])
  let loading    = $state(true)
  let error      = $state('')
  let open       = $state<string | null>(null)   // open picker id
  let saving     = $state<string | null>(null)

  async function load() {
    loading = true; error = ''
    try { categories = await invoke<Category[]>('defaultapps:list') }
    catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function setDefault(categoryId: string, desktopFile: string) {
    saving = categoryId; open = null
    try {
      await invoke('defaultapps:set', categoryId, desktopFile)
      await load()
    } catch (e) { error = String(e) }
    finally { saving = null }
  }

  onMount(() => load())
</script>

{#if loading}
  <Spinner />

{:else if error && !categories.length}
  <Alert message={error} />

{:else}
  <div class="space-y-1.5 max-w-xl">

    {#if error}
      <p class="text-xs text-destructive mb-2">{error}</p>
    {/if}

    <div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {#each categories as cat}
        <div class="px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium w-32 shrink-0">{cat.label}</span>

            <!-- Current / picker trigger -->
            <button
              onclick={() => open = open === cat.id ? null : cat.id}
              disabled={saving === cat.id}
              class="flex-1 flex items-center justify-between gap-2 px-3 py-1.5 rounded-md
                     border border-border hover:bg-secondary/50 transition-colors text-sm
                     {open === cat.id ? 'bg-secondary/50' : ''}"
            >
              <span class="truncate {cat.current ? '' : 'text-muted-foreground'}">
                {cat.currentName || cat.current || 'Not set'}
              </span>
              {#if saving === cat.id}
                <RefreshCw size={13} class="animate-spin text-muted-foreground shrink-0" />
              {:else}
                <ChevronDown size={13} class="text-muted-foreground shrink-0 {open === cat.id ? 'rotate-180' : ''}" />
              {/if}
            </button>
          </div>

          <!-- App picker dropdown -->
          {#if open === cat.id}
            <div class="mt-2 rounded-lg border border-border bg-secondary/30 overflow-hidden max-h-48 overflow-y-auto">
              {#if cat.apps.length === 0}
                <p class="px-3 py-4 text-xs text-muted-foreground text-center">No applications found for this type</p>
              {:else}
                {#each cat.apps as app}
                  <button
                    onclick={() => setDefault(cat.id, app.id)}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                           hover:bg-secondary transition-colors
                           {cat.current === app.id ? 'text-primary' : ''}"
                  >
                    {#if cat.current === app.id}
                      <Check size={13} class="text-primary shrink-0" />
                    {:else}
                      <span class="w-[13px] shrink-0"></span>
                    {/if}
                    {app.name}
                    <span class="text-[10px] text-muted-foreground/60 ml-auto truncate max-w-[180px]">{app.id}</span>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <p class="text-xs text-muted-foreground px-1">
      Changes apply immediately via xdg-mime. Some apps may require re-login to take effect.
    </p>

  </div>
{/if}
