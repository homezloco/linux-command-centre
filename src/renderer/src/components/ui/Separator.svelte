<script lang="ts" module>
  export type SeparatorProps = {
    orientation?: 'horizontal' | 'vertical'
    class?: string
    decorative?: boolean
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let {
    orientation = 'horizontal',
    class: className,
    decorative = true,
  }: SeparatorProps = $props()
</script>

<hr
  {orientation}
  role={decorative ? 'none' : 'separator'}
  aria-orientation={decorative ? undefined : orientation}
  class={cn(
    'shrink-0 bg-border',
    orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
    className,
  )}
/>
