<script lang="ts" module>
  export type BadgeProps = {
    variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
    size?: 'sm' | 'md'
    class?: string
    children?: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'
  import type { Snippet } from 'svelte'

  let {
    variant = 'default',
    size = 'md',
    class: className,
    children,
  }: BadgeProps = $props()

  const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-secondary text-secondary-foreground border border-border',
    success: 'bg-status-ok/10 text-status-ok border border-status-ok/20',
    warning: 'bg-status-warn/10 text-status-warn border border-status-warn/20',
    destructive: 'bg-status-fail/10 text-status-fail border border-status-fail/20',
    outline: 'text-foreground border border-border',
  }

  const sizes = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-sm',
  } as const
</script>

<span
  class={cn(
    'inline-flex items-center font-medium rounded-full border transition-colors',
    variants[variant],
    sizes[size],
    className,
  )}
>
  {@render children?.()}
</span>
