<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export type CardProps = {
    padding?: 'none' | 'sm' | 'md'
    class?: string
    children: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let {
    padding = 'md',
    class: className,
    children,
  }: CardProps = $props()

  const pad = { none: 'p-0', sm: 'p-3', md: 'p-4' } as const
</script>

<div class={cn('rounded-xl border border-border bg-card', pad[padding], className)}>
  {@render children()}
</div>
