<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Save, AlertTriangle } from 'lucide-svelte'

  type GrubStatus = {
    timeout: string; default: string; cmdlineDefault: string
    timeoutStyle: string; entries: string[]
  }

  let status  = $state<GrubStatus | null>(null)
  let loading = $state(true)
  let saving  = $state(false)
  let error   = $state('')
  let success = $state('')

  let dTimeout = $state('')
  let dDefault = $state('')
  let dCmdline = $state('')
  let dStyle   = $state('')

  const dirty = $derived(
    status !== null && (
      dTimeout !== status.timeout ||
      dDefault !== status.default ||
      dCmdline !== status.cmdlineDefault ||
      dStyle   !== status.timeoutStyle
    )
  )

  async function load() {
    loading = true; error = ''; success = ''
    try {
      status = await invoke<GrubStatus>('grub:status')
      dTimeout = status.timeout
      dDefault = status.default
      dCmdline = status.cmdlineDefault
      dStyle   = status.timeoutStyle
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''; success = ''
    try {
      await invoke('grub:set', {
        GRUB_TIMEOUT:              dTimeout,
        GRUB_DEFAULT:              dDefault,
        GRUB_CMDLINE_LINUX_DEFAULT: dCmdline,
        GRUB_TIMEOUT_STYLE:        dStyle,
      })
      success = 'GRUB config updated — changes take effect on next boot.'
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  onMount(() => load())
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else if error && !status}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Warning -->
    <div class="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex gap-3 items-start">
      <AlertTriangle size={15} class="text-yellow-400 mt-0.5 shrink-0" />
      <p class="text-xs text-muted-foreground">
        Saving will run <span class="font-mono text-foreground">update-grub</span> and requires authentication.
        Changes take effect on next boot.
      </p>
    </div>

    <!-- Settings form -->
    <div class="rounded-xl border border-border bg-card p-5 space-y-5">

      <!-- Boot timeout -->
      <div class="space-y-1.5">
        <label for="grub-timeout" class="text-sm font-medium">Boot menu timeout</label>
        <p class="text-xs text-muted-foreground">
          Seconds to show the boot menu before auto-booting. <span class="font-mono">0</span> = skip immediately,
          <span class="font-mono">-1</span> = wait forever.
        </p>
        <input
          id="grub-timeout"
          type="number" min="-1" max="300"
          bind:value={dTimeout}
          class="w-28 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm tabular-nums
                 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <!-- Timeout style -->
      <div class="space-y-1.5">
        <label for="grub-style" class="text-sm font-medium">Timeout style</label>
        <select
          id="grub-style"
          bind:value={dStyle}
          class="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="menu">menu — always show boot menu</option>
          <option value="hidden">hidden — skip menu, boot immediately</option>
          <option value="countdown">countdown — hidden with countdown timer</option>
        </select>
      </div>

      <!-- Default entry -->
      <div class="space-y-1.5">
        <label for="grub-default" class="text-sm font-medium">Default boot entry</label>
        <p class="text-xs text-muted-foreground">
          Entry index (0 = first), entry title, or <span class="font-mono">saved</span> to remember last choice.
        </p>
        {#if status.entries.length > 0}
          <select
            id="grub-default"
            bind:value={dDefault}
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                   focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {#each status.entries as entry, i}
              <option value={String(i)}>{i}: {entry}</option>
            {/each}
            <option value="saved">saved — remember last choice</option>
          </select>
        {:else}
          <input
            id="grub-default"
            bind:value={dDefault}
            class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm
                   focus:outline-none focus:ring-1 focus:ring-primary"
          />
        {/if}
      </div>

      <!-- Kernel parameters -->
      <div class="space-y-1.5">
        <label for="grub-cmdline" class="text-sm font-medium">Kernel parameters</label>
        <p class="text-xs text-muted-foreground">
          Extra parameters appended to the kernel command line (<span class="font-mono">GRUB_CMDLINE_LINUX_DEFAULT</span>).
        </p>
        <input
          id="grub-cmdline"
          bind:value={dCmdline}
          placeholder="quiet splash"
          class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm font-mono
                 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

    </div>

    <!-- Boot entries list -->
    {#if status.entries.length > 0}
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="px-4 py-3 border-b border-border">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Detected Boot Entries
          </p>
        </div>
        <div class="divide-y divide-border">
          {#each status.entries as entry, i}
            <div class="flex items-center gap-3 px-4 py-2.5">
              <span class="text-xs text-muted-foreground/50 tabular-nums w-5 shrink-0">{i}</span>
              <span class="text-sm flex-1 {String(i) === status.default ? 'font-medium text-primary' : ''}">{entry}</span>
              {#if String(i) === status.default}
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">default</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if success}
      <p class="text-xs text-green-400">{success}</p>
    {/if}
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    <div class="flex justify-end">
      <button
        onclick={save}
        disabled={!dirty || saving}
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground
               text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {#if saving}
          <RefreshCw size={14} class="animate-spin" />
          Updating GRUB…
        {:else}
          <Save size={14} />
          Save & Update GRUB
        {/if}
      </button>
    </div>

  </div>
{/if}
