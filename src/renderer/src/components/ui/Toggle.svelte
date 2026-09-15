<script lang="ts" module>
  export type ToggleProps = {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    id?: string
    'aria-labelledby'?: string
    'aria-label'?: string
  }
</script>

<script lang="ts">
  import { Switch } from 'bits-ui'
  import { cn } from '$lib/utils'

  let {
    checked,
    onCheckedChange,
    disabled = false,
    id,
    'aria-labelledby': ariaLabelledby,
    'aria-label': ariaLabel,
  }: ToggleProps = $props()
</script>

<Switch.Root
  {id}
  {checked}
  {onCheckedChange}
  {disabled}
  aria-labelledby={ariaLabelledby}
  aria-label={ariaLabel}
  class={cn(
    'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
    'data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary data-[state=unchecked]:border-border',
    'disabled:cursor-not-allowed disabled:opacity-50',
  )}
>
  <Switch.Thumb
    class={cn(
      'pointer-events-none block h-5 w-5 rounded-full bg-[hsl(var(--toggle-thumb))] shadow-sm ring-1 ring-border transition-transform',
      'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
    )}
  />
</Switch.Root>
