<script lang="ts" module>
  export type Segment<T extends string = string> = { value: T; label: string; disabled?: boolean }

  export type SegmentedControlProps<T extends string = string> = {
    value: T
    onChange: (value: T) => void
    options: Segment<T>[]
    ariaLabel: string
  }
</script>

<script lang="ts" generics="T extends string">
  import { tick } from 'svelte'
  import { cn } from '$lib/utils'

  let { value, onChange, options, ariaLabel }: SegmentedControlProps<T> = $props()

  let groupEl = $state<HTMLDivElement | undefined>(undefined)

  async function move(next: T) {
    onChange(next)
    await tick()
    groupEl?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus()
  }

  function onKeydown(e: KeyboardEvent) {
    const enabled = options.filter((o) => !o.disabled)
    const i = enabled.findIndex((o) => o.value === value)
    if (i < 0 || enabled.length === 0) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      void move(enabled[(i + 1) % enabled.length].value)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      void move(enabled[(i - 1 + enabled.length) % enabled.length].value)
    }
  }
</script>

<div
  bind:this={groupEl}
  role="radiogroup"
  aria-label={ariaLabel}
  class="inline-flex rounded-md border border-border bg-secondary/50 p-0.5"
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      aria-disabled={opt.disabled || undefined}
      disabled={opt.disabled}
      tabindex={value === opt.value ? 0 : -1}
      onclick={() => !opt.disabled && onChange(opt.value)}
      onkeydown={onKeydown}
      class={cn(
        'rounded-[5px] px-2.5 py-1 text-[13px] font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        value === opt.value
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]',
      )}
    >
      {opt.label}
    </button>
  {/each}
</div>
