<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export type PanelHeaderProps = {
    title: string
    description?: string
    badge?: string
    class?: string
    actions?: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let {
    title,
    description,
    badge,
    class: className,
    actions,
  }: PanelHeaderProps = $props()
</script>

<div class={cn('mb-6 flex flex-col gap-1 pb-4 border-b border-border/40', className)}>
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-2.5">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {#if badge}
        <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      {/if}
    </div>
    {#if actions}
      <div class="flex items-center gap-2 shrink-0">
        {@render actions()}
      </div>
    {/if}
  </div>
  {#if description}
    <p class="text-xs text-muted-foreground max-w-2xl">{description}</p>
  {/if}
</div>
