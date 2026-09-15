<script lang="ts" module>
  import type { Snippet } from 'svelte'
  import type { Icon } from 'lucide-svelte'

  export type EmptyStateProps = {
    icon: typeof Icon
    title: string
    message: string
    action?: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let { icon: IconComp, title, message, action }: EmptyStateProps = $props()
</script>

<div class={cn('rounded-xl border border-border bg-card p-6 text-center space-y-3')}>
  <IconComp size={32} class="mx-auto text-muted-foreground/40" />
  <div>
    <p class="text-[13px] font-medium">{title}</p>
    <p class="text-xs text-muted-foreground mt-1">{message}</p>
  </div>
  {#if action}
    <div>
      {@render action()}
    </div>
  {/if}
</div>
