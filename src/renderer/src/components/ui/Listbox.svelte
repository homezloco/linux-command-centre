<script lang="ts" module>
  export type ListboxOption<T extends string = string> = { value: T; label: string; disabled?: boolean }

  export type ListboxProps<T extends string = string> = {
    value: T
    onChange: (value: T) => void
    options: ListboxOption<T>[]
    placeholder?: string
    filterable?: boolean
    disabled?: boolean
    id?: string
    'aria-label'?: string
    'aria-labelledby'?: string
  }
</script>

<script lang="ts" generics="T extends string">
  import { Select, Combobox } from 'bits-ui'
  import { Check, ChevronDown } from 'lucide-svelte'
  import { cn, overlayPortalTarget } from '$lib/utils'

  let {
    value,
    onChange,
    options,
    placeholder = 'Select…',
    filterable = false,
    disabled = false,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  }: ListboxProps<T> = $props()

  let searchValue = $state('')
  let open = $state(false)
  let inputGen = $state(0)

  const selected = $derived(options.find((o) => o.value === value))
  const filtered = $derived(
    searchValue.trim() === ''
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(searchValue.toLowerCase())),
  )
  const committedLabel = $derived(selected?.label ?? '')

  const triggerClass = cn(
    'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 text-[13px]',
    'disabled:cursor-not-allowed disabled:opacity-50',
  )

  const contentClass = cn(
    'z-50 pointer-events-auto overflow-hidden rounded-md border border-border bg-card p-1 shadow-md',
    'max-h-60 overflow-y-auto',
  )

  const itemClass = cn(
    'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none',
    'data-[highlighted]:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  )

  function handleValueChange(v: string) {
    onChange(v as T)
  }

  function handleOpenChange(next: boolean) {
    open = next
    if (!next) {
      searchValue = ''
      inputGen += 1
    }
  }
</script>

{#if filterable}
  <Combobox.Root
    type="single"
    {value}
    {open}
    onValueChange={handleValueChange}
    {disabled}
    allowDeselect={false}
    items={options}
    onOpenChange={handleOpenChange}
  >
    <div class="relative">
      {#key `${committedLabel}:${inputGen}`}
        <Combobox.Input
          {id}
          {placeholder}
          defaultValue={committedLabel}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          onpointerdown={() => {
            if (!disabled && !open) open = true
          }}
          oninput={(e) => {
            searchValue = e.currentTarget.value
            if (!open) open = true
          }}
          class={cn(triggerClass, 'pr-8')}
        />
      {/key}
      <Combobox.Trigger
        tabindex={-1}
        aria-label="Toggle list"
        class="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-muted-foreground"
      >
        <ChevronDown size={14} />
      </Combobox.Trigger>
    </div>
    <Combobox.Portal to={overlayPortalTarget()}>
      <Combobox.Content
        sideOffset={4}
        class={cn(contentClass, 'w-[var(--bits-combobox-anchor-width)] min-w-[var(--bits-combobox-anchor-width)]')}
      >
        {#each filtered as opt (opt.value)}
          <Combobox.Item
            value={opt.value}
            label={opt.label}
            disabled={opt.disabled}
            class={itemClass}
          >
            {#snippet children({ selected: isSelected })}
              <span class="flex-1 truncate">{opt.label}</span>
              {#if isSelected}
                <Check size={14} class="shrink-0 text-primary" />
              {/if}
            {/snippet}
          </Combobox.Item>
        {:else}
          <p class="px-2 py-1.5 text-[13px] text-muted-foreground">No results</p>
        {/each}
      </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
{:else}
  <Select.Root
    type="single"
    {value}
    onValueChange={handleValueChange}
    {disabled}
    allowDeselect={false}
    items={options}
  >
    <Select.Trigger
      {id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      class={triggerClass}
    >
      <span class={cn('truncate', !selected && 'text-muted-foreground')}>
        {selected?.label ?? placeholder}
      </span>
      <ChevronDown size={14} class="shrink-0 text-muted-foreground" />
    </Select.Trigger>
    <Select.Portal to={overlayPortalTarget()}>
      <Select.Content
        sideOffset={4}
        class={cn(contentClass, 'w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)]')}
      >
        {#each options as opt (opt.value)}
          <Select.Item
            value={opt.value}
            label={opt.label}
            disabled={opt.disabled}
            class={itemClass}
          >
            {#snippet children({ selected: isSelected })}
              <span class="flex-1 truncate">{opt.label}</span>
              {#if isSelected}
                <Check size={14} class="shrink-0 text-primary" />
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}
