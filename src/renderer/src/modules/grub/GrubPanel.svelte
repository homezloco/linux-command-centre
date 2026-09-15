<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { Page, Card, Skeleton, Button, Listbox, EmptyState } from '$ui'
  import { RefreshCw, Save, Layers } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'

  type GrubStatus = {
    timeout: string; default: string; cmdlineDefault: string
    timeoutStyle: string; entries: string[]
  }

  const TITLE = 'Boot Manager'
  const inputCls = 'h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary'

  const STYLE_OPTIONS = [
    { value: 'menu',      label: 'menu — always show boot menu' },
    { value: 'hidden',    label: 'hidden — skip menu, boot immediately' },
    { value: 'countdown', label: 'countdown — hidden with countdown timer' },
  ]

  let status  = $state<GrubStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let saving  = $state(false)
  let error   = $state('')

  let dTimeout = $state<string | number>('')
  let dDefault = $state('')
  let dCmdline = $state('')
  let dStyle   = $state('')

  const dirty = $derived(
    status !== null && (
      String(dTimeout) !== status.timeout ||
      dDefault !== status.default ||
      dCmdline !== status.cmdlineDefault ||
      dStyle   !== status.timeoutStyle
    )
  )

  const defaultOptions = $derived.by(() => {
    const opts = (status?.entries ?? []).map((entry, i) => ({ value: String(i), label: `${i}: ${entry}` }))
    opts.push({ value: 'saved', label: 'saved — remember last choice' })
    // A default that is a title or an unknown index still needs to be selectable
    const s = status
    if (s && !opts.some(o => o.value === s.default)) opts.unshift({ value: s.default, label: s.default })
    return opts
  })

  // grub:status is an unprivileged read: auto-load, no auth gate.
  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<GrubStatus>('grub:status')
      dTimeout = status.timeout
      dDefault = status.default
      dCmdline = status.cmdlineDefault
      dStyle   = status.timeoutStyle
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  // Explicit Save: a multi-field write to /etc/default/grub + update-grub (privileged)
  async function save() {
    saving = true
    try {
      await invoke('grub:set', {
        GRUB_TIMEOUT:               String(dTimeout),
        GRUB_DEFAULT:               dDefault,
        GRUB_CMDLINE_LINUX_DEFAULT: dCmdline,
        GRUB_TIMEOUT_STYLE:         dStyle,
      })
      toasts.success('GRUB config updated — changes take effect on next boot', TITLE)
      await load(true)
    } catch (e) { toasts.error(String(e), TITLE) }
    finally { saving = false }
  }

  function reset() {
    if (!status) return
    dTimeout = status.timeout
    dDefault = status.default
    dCmdline = status.cmdlineDefault
    dStyle   = status.timeoutStyle
  }

  onMount(() => { void load() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label={dirty ? 'Discard changes and reload' : 'Reload GRUB config'}
      disabled={refreshing || loading || saving}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if loading}
      <Skeleton class="h-14 w-full" />
      <Skeleton class="h-80 w-full" />

    {:else if !status}
      <!-- Only reached when the unprivileged read itself failed -->
      <EmptyState icon={Layers} title="Could not read boot config" message={error || '/etc/default/grub could not be read.'}>
        {#snippet action()}
          <Button variant="primary" size="sm" loading={refreshing} onclick={() => load(true)}>Retry</Button>
        {/snippet}
      </EmptyState>

    {:else}
      {#if error}
        <Alert message={error} />
      {/if}

      <Alert variant="warn" message="Saving runs update-grub and requires authentication. Changes take effect on next boot." />

      <!-- Settings form -->
      <Card class="p-5 space-y-5">
        <div class="space-y-1.5">
          <label for="grub-timeout" class="text-[13px] font-medium">Boot menu timeout</label>
          <p class="text-xs text-muted-foreground">
            Seconds to show the boot menu before auto-booting. <span class="font-mono">0</span> = skip immediately,
            <span class="font-mono">-1</span> = wait forever.
          </p>
          <input id="grub-timeout" type="number" min="-1" max="300" bind:value={dTimeout} class="{inputCls} w-28 tabular-nums" />
        </div>

        <div class="space-y-1.5">
          <label for="grub-style" class="text-[13px] font-medium">Timeout style</label>
          <Listbox id="grub-style" value={dStyle} options={STYLE_OPTIONS} onChange={(v) => { dStyle = v }} />
        </div>

        <div class="space-y-1.5">
          <label for="grub-default" class="text-[13px] font-medium">Default boot entry</label>
          <p class="text-xs text-muted-foreground">
            Entry index (0 = first), entry title, or <span class="font-mono">saved</span> to remember the last choice.
          </p>
          {#if status.entries.length > 0}
            <Listbox id="grub-default" value={dDefault} options={defaultOptions} onChange={(v) => { dDefault = v }} />
          {:else}
            <input id="grub-default" bind:value={dDefault} class="{inputCls} w-full" />
          {/if}
        </div>

        <div class="space-y-1.5">
          <label for="grub-cmdline" class="text-[13px] font-medium">Kernel parameters</label>
          <p class="text-xs text-muted-foreground">
            Extra parameters appended to the kernel command line (<span class="font-mono">GRUB_CMDLINE_LINUX_DEFAULT</span>).
          </p>
          <input id="grub-cmdline" bind:value={dCmdline} placeholder="quiet splash" class="{inputCls} w-full font-mono" />
        </div>
      </Card>

      <!-- Boot entries -->
      {#if status.entries.length > 0}
        <Card padding="none" class="overflow-hidden">
          <div class="px-4 py-3 border-b border-border">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Detected boot entries</p>
          </div>
          <div class="divide-y divide-border">
            {#each status.entries as entry, i (i)}
              <div class="flex items-center gap-3 px-4 py-2">
                <span class="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i}</span>
                <span class="text-[13px] flex-1 truncate {String(i) === status.default ? 'font-medium text-primary' : ''}">{entry}</span>
                {#if String(i) === status.default}
                  <span class="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">default</span>
                {/if}
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <div class="flex justify-end gap-2">
        {#if dirty}
          <Button variant="secondary" size="sm" disabled={saving} onclick={reset}>Reset</Button>
        {/if}
        <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onclick={save}>
          {#if !saving}<Save size={14} />{/if}
          {saving ? 'Updating GRUB…' : 'Save & update GRUB'}
        </Button>
      </div>
    {/if}
  </div>
</Page>
