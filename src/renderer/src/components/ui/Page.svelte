<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export type PageProps = {
    description?: string
    width?: 'narrow' | 'wide'
    fill?: boolean
    class?: string
    children: Snippet
    actions?: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let {
    description,
    width = 'wide',
    fill = false,
    class: className,
    children,
    actions,
  }: PageProps = $props()
</script>

<div
  class={cn(
    'text-[13px]',
    width === 'narrow' ? 'max-w-lg w-full' : 'w-full',
    fill && 'flex flex-col h-full min-h-0',
    className,
  )}
>
  {#if description || actions}
    <div class={cn('mb-4 flex items-start gap-3', fill && 'shrink-0', description ? 'justify-between' : 'justify-end')}>
      {#if description}
        <p class="text-xs text-muted-foreground">{description}</p>
      {/if}
      {#if actions}
        <div class="shrink-0 flex items-center gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/if}
  {@render children()}
</div>
