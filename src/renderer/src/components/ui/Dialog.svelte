<script lang="ts" module>
  import type { Snippet } from 'svelte'

  export type DialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    description?: string
    class?: string
    children?: Snippet
    dismissible?: boolean
  }
</script>

<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui'
  import { cn, overlayPortalTarget } from '$lib/utils'

  let {
    open,
    onOpenChange,
    title,
    description,
    class: className,
    children,
    dismissible = true,
  }: DialogProps = $props()

  function onEscapeKeydown(e: KeyboardEvent) {
    if (!dismissible) e.preventDefault()
  }

  function onInteractOutside(e: PointerEvent) {
    if (!dismissible) e.preventDefault()
  }
</script>

<BitsDialog.Root {open} {onOpenChange}>
  <BitsDialog.Portal to={overlayPortalTarget()}>
    <BitsDialog.Overlay class="fixed inset-0 z-50 pointer-events-auto bg-black/50" />
    <BitsDialog.Content
      {onEscapeKeydown}
      {onInteractOutside}
      trapFocus
      class={cn(
        'fixed left-1/2 top-1/2 z-50 pointer-events-auto w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        'rounded-xl border border-border bg-card p-5 shadow-xl space-y-3',
        className,
      )}
    >
      {#if title}
        <BitsDialog.Title class="text-[13px] font-semibold leading-none">{title}</BitsDialog.Title>
      {/if}
      {#if description}
        <BitsDialog.Description class="text-xs text-muted-foreground">{description}</BitsDialog.Description>
      {/if}
      {@render children?.()}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
