<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export type ButtonProps = {
    variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'icon'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    class?: string
    children?: Snippet
    onclick?: (e: MouseEvent) => void
    'aria-label'?: string
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    class: className,
    children,
    onclick,
    'aria-label': ariaLabel,
  }: ButtonProps = $props()

  $effect.pre(() => {
    if (variant === 'icon' && !ariaLabel) {
      throw new Error('Button variant="icon" requires aria-label')
    }
  })

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary:
      'bg-secondary text-secondary-foreground hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost:
      'text-foreground hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]',
    icon: 'text-muted-foreground hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]',
  }

  const sizes = $derived({
    sm: variant === 'icon' ? 'h-7 w-7 p-0' : 'h-7 px-2.5',
    md: variant === 'icon' ? 'h-8 w-8 p-0' : 'h-8 px-3',
  })
</script>

<button
  {type}
  {onclick}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  aria-label={ariaLabel}
  class={cn(
    'pressable inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )}
>
  {#if loading}
    <span
      class="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
      aria-hidden="true"
    ></span>
  {/if}
  {#if !loading || variant !== 'icon'}
    {@render children?.()}
  {/if}
</button>
