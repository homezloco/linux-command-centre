<script lang="ts" module>
  export type SkeletonProps = { class?: string }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'

  let { class: className }: SkeletonProps = $props()
</script>

<div class={cn('rounded-md bg-secondary/80 motion-safe:animate-pulse', className)}></div>
