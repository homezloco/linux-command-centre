<script lang="ts" module>
  import type { HTMLInputAttributes } from 'svelte/elements'

  export type InputProps = HTMLInputAttributes & {
    error?: string
    class?: string
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'
  import type { HTMLInputAttributes } from 'svelte/elements'

  let {
    error,
    class: className,
    type = 'text',
    disabled = false,
    required = false,
    id,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...rest
  }: InputProps = $props()

  const hasError = error != null && error !== ''
  const describedBy = [ariaDescribedBy, hasError ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ') || undefined
</script>

<div class="w-full">
  <input
    {id}
    {type}
    {disabled}
    {required}
    aria-invalid={hasError || ariaInvalid}
    aria-describedby={describedBy}
    class={cn(
      'flex h-8 w-full rounded-md border border-input bg-background',
      'px-3 py-1.5 text-sm placeholder:text-muted-foreground',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      'focus-visible:outline-none focus-visible:ring-2',
      'focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      hasError && 'border-destructive focus-visible:ring-destructive',
      className,
    )}
    {...rest}
  />
  {#if hasError}
    <p
      id={id}-error
      class="mt-1.5 text-sm text-destructive"
      role="alert"
    >
      {error}
    </p>
  {/if}
</div>
