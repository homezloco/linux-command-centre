<script lang="ts" module>
  export type LabelProps = {
    for?: string
    class?: string
    children?: Snippet
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'
  import type { Snippet } from 'svelte'

  let {
    for: htmlFor,
    class: className,
    children,
  }: LabelProps = $props()
</script>

<label
  {htmlFor}
  class={cn(
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    className,
  )}
>
  {@render children?.()}
</label>
