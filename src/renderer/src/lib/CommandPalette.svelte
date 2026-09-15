<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { Search, ArrowRight, Icon } from 'lucide-svelte'
  import { closePalette, openPalette, paletteOpen } from '$stores/palette'

  type Item = {
    id: string
    label: string
    group: string
    icon: typeof Icon
    keywords?: string[]
  }

  let { items, onselect }: { items: Item[]; onselect: (id: string) => void } = $props()

  let query   = $state('')
  let cursor  = $state(0)
  let inputEl = $state<HTMLInputElement | undefined>(undefined)
  let listEl  = $state<HTMLElement | undefined>(undefined)
  let dialogEl = $state<HTMLElement | undefined>(undefined)

  function rankItem(item: Item, q: string): number | null {
    const nq = q.toLowerCase()
    const label = item.label.toLowerCase()
    const group = item.group.toLowerCase()
    const keywords = (item.keywords ?? []).map((k) => k.toLowerCase())
    const exact = label === nq || keywords.includes(nq)
    const sub = label.includes(nq) || group.includes(nq) || keywords.some((k) => k.includes(nq))
    if (!exact && !sub) return null
    return exact ? 0 : 1
  }

  function filterItems(list: Item[], raw: string): Item[] {
    const q = raw.trim()
    if (!q) return list
    const scored: { item: Item; score: number }[] = []
    for (const item of list) {
      const score = rankItem(item, q)
      if (score == null) continue
      scored.push({ item, score })
    }
    scored.sort((a, b) => a.score - b.score)
    return scored.map((s) => s.item)
  }

  const results = $derived(filterItems(items, query))

  $effect(() => {
    void results
    cursor = 0
  })

  function select(id: string) {
    onselect(id)
    closePalette()
    query = ''
  }

  function typingInInput(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    if (!target) return false
    const tag = target.tagName?.toLowerCase()
    const isEditable = target.isContentEditable
    const isTextInput = tag === 'input' || tag === 'textarea' || tag === 'select'
    return isTextInput || isEditable
  }

  function trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !$paletteOpen || !dialogEl) return
    const focusable = [...dialogEl.querySelectorAll<HTMLElement>(
      'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    )].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
    if (focusable.length === 0) {
      e.preventDefault()
      inputEl?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  async function handleKeydown(e: KeyboardEvent) {
    if ($paletteOpen) {
      trapTab(e)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        closePalette()
        query = ''
        return
      }
      if (e.key === 'Escape')    { e.preventDefault(); closePalette(); query = '' }
      if (e.key === 'ArrowDown' && results.length) {
        e.preventDefault()
        cursor = (cursor + 1) % results.length
        scrollCursor()
      }
      if (e.key === 'ArrowUp' && results.length) {
        e.preventDefault()
        cursor = (cursor - 1 + results.length) % results.length
        scrollCursor()
      }
      if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); select(results[cursor].id) }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      openPalette()
      return
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typingInInput(e)) {
      e.preventDefault()
      openPalette()
    }
  }

  function scrollCursor() {
    tick().then(() => {
      const activeOpt = listEl?.querySelector(`#palette-opt-${results[cursor]?.id}`)
      activeOpt?.scrollIntoView({ block: 'nearest' })
    })
  }

  $effect(() => {
    if (!$paletteOpen) return
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    query = ''
    cursor = 0
    tick().then(() => inputEl?.focus())
    return () => {
      query = ''
      prev?.focus()
    }
  })

  onMount(() => window.addEventListener('keydown', handleKeydown))
  onDestroy(() => window.removeEventListener('keydown', handleKeydown))
</script>

{#if $paletteOpen}
  <div
    class="fixed inset-0 bg-black/40 z-40"
    aria-hidden="true"
    onclick={() => { closePalette(); query = '' }}
  ></div>

  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    class="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md shadow-2xl rounded-xl
           border border-border bg-card overflow-hidden"
  >
    <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
      <Search size={16} class="text-muted-foreground shrink-0" />
      <input
        bind:this={inputEl}
        bind:value={query}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-listbox"
        aria-activedescendant={results[cursor] ? `palette-opt-${results[cursor].id}` : undefined}
        autocomplete="off"
        placeholder="Go to…"
        class="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <kbd class="text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
    </div>

    <div bind:this={listEl} id="palette-listbox" role="listbox" class="max-h-72 overflow-y-auto py-1">
      {#if results.length === 0}
        <p class="px-4 py-6 text-center text-[13px] text-muted-foreground">No results</p>
      {:else}
        {#each results as item, i (item.id)}
          {@const Icon = item.icon}
          <div
            role="option"
            id="palette-opt-{item.id}"
            aria-selected={cursor === i}
            tabindex="-1"
            onclick={() => select(item.id)}
            onmouseenter={() => cursor = i}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(item.id) } }}
            class="w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors
                   {cursor === i ? 'bg-primary/10 text-primary' : 'hover:bg-secondary/50'}"
          >
            <Icon size={14} class="shrink-0 {cursor === i ? 'text-primary' : 'text-muted-foreground'}" />
            <span class="flex-1 text-[13px]">{item.label}</span>
            <span class="text-[11px] text-muted-foreground">{item.group}</span>
            {#if cursor === i}
              <ArrowRight size={12} class="text-primary" />
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="px-4 py-2 border-t border-border flex items-center gap-3 text-[11px] text-muted-foreground">
      <span><kbd class="border border-border rounded px-1">↑↓</kbd> navigate</span>
      <span><kbd class="border border-border rounded px-1">↵</kbd> select</span>
      <span><kbd class="border border-border rounded px-1">Ctrl K</kbd> toggle</span>
    </div>
  </div>
{/if}
