<script lang="ts" module>
  export type ConfirmAction = {
    label: string
    variant: 'primary' | 'destructive' | 'secondary' | 'ghost'
    onClick: () => void | Promise<void>
  }

  export type ConfirmDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    actions: ConfirmAction[]
    busy?: boolean
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils'
  import Dialog from './Dialog.svelte'
  import Button from './Button.svelte'

  let {
    open,
    onOpenChange,
    title,
    description,
    actions,
    busy = false,
  }: ConfirmDialogProps = $props()

  let pending = $state(false)
  let pendingLabel = $state<string | null>(null)
  const isBusy = $derived(busy || pending)

  async function run(action: ConfirmAction) {
    if (isBusy) return
    pending = true
    pendingLabel = action.label
    try {
      await action.onClick()
    } finally {
      pending = false
      pendingLabel = null
    }
  }
</script>

<Dialog {open} {onOpenChange} {title} {description} dismissible={!isBusy}>
  <div class={cn('flex justify-end gap-2 pt-1')}>
    {#each actions as action (action.label)}
      <Button
        variant={action.variant}
        disabled={isBusy}
        loading={pendingLabel === action.label}
        onclick={() => run(action)}
      >
        {action.label}
      </Button>
    {/each}
  </div>
</Dialog>
