<script lang="ts" module>
  export type SearchFieldProps = {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    class?: string
    id?: string
    'aria-label'?: string
  }
</script>

<script lang="ts">
  import { Search, X } from 'lucide-svelte'
  import { cn } from '$lib/utils'

  let {
    value,
    onChange,
    placeholder,
    class: className,
    id,
    'aria-label': ariaLabel,
  }: SearchFieldProps = $props()
</script>

<div class={cn('relative', className)}>
  <Search
    size={14}
    class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
  />
  <input
    type="search"
    {id}
    {value}
    {placeholder}
    aria-label={ariaLabel}
    oninput={(e) => onChange(e.currentTarget.value)}
    class={cn(
      'h-8 w-full rounded-md border border-border bg-secondary/50 py-1.5 pl-8 text-[13px]',
      'placeholder:text-muted-foreground/50',
      '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
      value ? 'pr-8' : 'pr-3',
    )}
  />
  {#if value}
    <button
      type="button"
      aria-label="Clear search"
      onclick={() => onChange('')}
      class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <X size={12} />
    </button>
  {/if}
</div>
