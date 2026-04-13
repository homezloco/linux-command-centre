<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { Search, ArrowRight } from 'lucide-svelte'

  type Item = { id: string; label: string; group: string; icon: unknown }

  let { items, onselect }: { items: Item[]; onselect: (id: string) => void } = $props()

  let open    = $state(false)
  let query   = $state('')
  let cursor  = $state(0)
  let inputEl = $state<HTMLInputElement | undefined>(undefined)
  let listEl  = $state<HTMLElement | undefined>(undefined)

  const results = $derived(
    query.trim()
      ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) ||
                          i.group.toLowerCase().includes(query.toLowerCase()))
      : items
  )

  $effect(() => {
    // Reset cursor when results change
    cursor = 0
  })

  function select(id: string) {
    onselect(id)
    open = false
    query = ''
  }

  async function handleKeydown(e: KeyboardEvent) {
    // Open: Ctrl+K or just '/' when not typing in an input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      open = !open
      if (open) { await tick(); inputEl?.focus() }
      return
    }
    if (!open) return

    if (e.key === 'Escape')    { open = false; query = '' }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % results.length; scrollCursor() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); cursor = (cursor - 1 + results.length) % results.length; scrollCursor() }
    if (e.key === 'Enter' && results[cursor]) select(results[cursor].id)
  }

  function scrollCursor() {
    tick().then(() => {
      listEl?.children[cursor]?.scrollIntoView({ block: 'nearest' })
    })
  }

  onMount(() => window.addEventListener('keydown', handleKeydown))
  onDestroy(() => window.removeEventListener('keydown', handleKeydown))
</script>

{#if open}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/40 z-40"
    aria-label="Close command palette"
    onclick={() => { open = false; query = '' }}
  ></button>

  <!-- Palette -->
  <div class="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md shadow-2xl rounded-xl
              border border-border bg-card overflow-hidden">

    <!-- Search input -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
      <Search size={16} class="text-muted-foreground shrink-0" />
      <input
        bind:this={inputEl}
        bind:value={query}
        placeholder="Go to…"
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <kbd class="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
    </div>

    <!-- Results -->
    <div bind:this={listEl} class="max-h-72 overflow-y-auto py-1">
      {#if results.length === 0}
        <p class="px-4 py-6 text-center text-sm text-muted-foreground">No results</p>
      {:else}
        {#each results as item, i}
          <button
            onclick={() => select(item.id)}
            onmouseenter={() => cursor = i}
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                   {cursor === i ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50'}"
          >
            <!-- svelte-ignore component_name_lowercase -->
            <item.icon size={14} class="shrink-0 {cursor === i ? 'text-primary' : 'text-muted-foreground'}" />
            <span class="flex-1 text-sm">{item.label}</span>
            <span class="text-[10px] text-muted-foreground">{item.group}</span>
            {#if cursor === i}
              <ArrowRight size={12} class="text-primary" />
            {/if}
          </button>
        {/each}
      {/if}
    </div>

    <div class="px-4 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
      <span><kbd class="border border-border rounded px-1">↑↓</kbd> navigate</span>
      <span><kbd class="border border-border rounded px-1">↵</kbd> select</span>
      <span><kbd class="border border-border rounded px-1">Ctrl K</kbd> toggle</span>
    </div>
  </div>
{/if}
