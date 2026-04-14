<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '$lib/utils'
  import { RefreshCw, Palette, Sun, Moon, Monitor, Type, MousePointer2, ImageIcon } from 'lucide-svelte'

  type AppearanceStatus = {
    colorScheme: string; gtkTheme: string; iconTheme: string
    cursorTheme: string; fontName: string; textScale: number; cursorSize: number
    availableThemes: string[]; availableIcons: string[]
    wallpaper: string
  }

  type WallpaperEntry = { path: string; name: string }

  let status  = $state<AppearanceStatus | null>(null)
  let loading = $state(true)
  let error   = $state('')
  let saving  = $state(false)
  let dirty   = $state(false)

  let colorScheme  = $state('default')
  let gtkTheme     = $state('')
  let iconTheme    = $state('')
  let cursorTheme  = $state('')
  let textScale    = $state(1.0)
  let cursorSize   = $state(24)
  let wallpaper    = $state('')
  let wallpapers   = $state<WallpaperEntry[]>([])
  let wpLoading    = $state(false)

  const COLOR_SCHEMES = [
    { value: 'default',        label: 'System default', icon: Monitor },
    { value: 'prefer-light',   label: 'Light',          icon: Sun     },
    { value: 'prefer-dark',    label: 'Dark',            icon: Moon    },
  ]

  const CURSOR_SIZES = [16, 24, 32, 48, 64]

  async function load() {
    loading = true; error = ''
    try {
      status = await invoke<AppearanceStatus>('appearance:status')
      colorScheme = status.colorScheme
      gtkTheme    = status.gtkTheme
      iconTheme   = status.iconTheme
      cursorTheme = status.cursorTheme
      textScale   = status.textScale
      cursorSize  = status.cursorSize
      // Ensure wallpaper has file:// prefix for <img> display
      const wp = status.wallpaper || ''
      wallpaper = wp && !wp.startsWith('file://') ? `file://${wp}` : wp
      dirty     = false
    } catch (e) { error = String(e) }
    finally { loading = false }
  }

  async function save() {
    saving = true; error = ''
    try {
      await invoke('appearance:set', { colorScheme, gtkTheme, iconTheme, cursorTheme, textScale, cursorSize, wallpaper })
      await load()
    } catch (e) { error = String(e) }
    finally { saving = false }
  }

  async function loadWallpapers() {
    wpLoading = true
    try { wallpapers = await invoke<WallpaperEntry[]>('appearance:listWallpapers') }
    catch { wallpapers = [] }
    finally { wpLoading = false }
  }

  const mark = () => { dirty = true }

  onMount(() => { load(); loadWallpapers() })
</script>

{#if loading}
  <div class="flex items-center justify-center h-40">
    <RefreshCw size={20} class="animate-spin text-muted-foreground" />
  </div>

{:else if error && !status}
  <div class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>

{:else if status}
  <div class="space-y-4 max-w-xl">

    <!-- Color scheme -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <Monitor size={14} class="text-muted-foreground" /> Color Scheme
      </p>
      <div class="grid grid-cols-3 gap-2">
        {#each COLOR_SCHEMES as scheme}
          <button
            onclick={() => { colorScheme = scheme.value; mark() }}
            class="flex flex-col items-center gap-2 p-3 rounded-lg border text-sm transition-colors
                   {colorScheme === scheme.value
                     ? 'border-primary/40 bg-primary/10 text-primary'
                     : 'border-border hover:bg-secondary/50 text-muted-foreground'}"
          >
            <scheme.icon size={18} />
            <span class="text-xs">{scheme.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- GTK Theme -->
    {#if status.availableThemes.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium flex items-center gap-2">
          <Palette size={14} class="text-muted-foreground" /> GTK Theme
        </p>
        <select
          id="gtk-theme"
          bind:value={gtkTheme}
          onchange={mark}
          class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {#each status.availableThemes as t}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Icon Theme -->
    {#if status.availableIcons.length > 0}
      <div class="rounded-xl border border-border bg-card p-4 space-y-3">
        <p class="text-sm font-medium flex items-center gap-2">
          <Palette size={14} class="text-muted-foreground" /> Icon Theme
        </p>
        <select
          id="icon-theme"
          bind:value={iconTheme}
          onchange={mark}
          class="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5
                 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {#each status.availableIcons as t}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Text scale & cursor size -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-4">

      <!-- Text scale -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium flex items-center gap-2">
            <Type size={14} class="text-muted-foreground" /> Text Scaling
          </p>
          <span class="text-sm font-medium tabular-nums">{textScale.toFixed(2)}×</span>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground mb-1">
          <span>0.75×</span><span>1.00×</span><span>1.50×</span><span>2.00×</span>
        </div>
        <input
          type="range" min="0.75" max="2.0" step="0.05"
          bind:value={textScale}
          oninput={mark}
          class="w-full accent-primary"
        />
      </div>

      <div class="border-t border-border"></div>

      <!-- Cursor size -->
      <div class="space-y-2">
        <p class="text-sm font-medium flex items-center gap-2">
          <MousePointer2 size={14} class="text-muted-foreground" /> Cursor Size
        </p>
        <div class="flex gap-2 flex-wrap">
          {#each CURSOR_SIZES as sz}
            <button
              onclick={() => { cursorSize = sz; mark() }}
              class="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors
                     {cursorSize === sz
                       ? 'border-primary/40 bg-primary/10 text-primary'
                       : 'border-border hover:bg-secondary/50 text-muted-foreground'}"
            >
              {sz}px
            </button>
          {/each}
        </div>
      </div>

    </div>

    <!-- Font name (read-only display) -->
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted-foreground">System font</p>
        <p class="text-sm font-medium">{status.fontName}</p>
      </div>
    </div>

    <!-- Wallpaper -->
    <div class="rounded-xl border border-border bg-card p-4 space-y-3">
      <p class="text-sm font-medium flex items-center gap-2">
        <ImageIcon size={14} class="text-muted-foreground" /> Wallpaper
      </p>

      {#if wallpaper}
        <div class="rounded-lg overflow-hidden border border-border h-28 bg-secondary/30 relative">
          <img
            src={wallpaper}
            alt="Current wallpaper"
            class="w-full h-full object-cover"
            onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div class="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono truncate max-w-[80%]">
            {wallpaper.replace(/^.*\//, '')}
          </div>
        </div>
      {/if}

      {#if wpLoading}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw size={12} class="animate-spin" /> Loading wallpapers…
        </div>
      {:else if wallpapers.length > 0}
        <div class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
          {#each wallpapers as wp}
            {@const isActive = wallpaper === `file://${wp.path}` || wallpaper === wp.path}
            <button
              onclick={() => { wallpaper = `file://${wp.path}`; mark() }}
              title={wp.name}
              class="relative rounded-md overflow-hidden border-2 aspect-video transition-colors
                     {isActive ? 'border-primary' : 'border-transparent hover:border-border'}"
            >
              <img
                src="file://{wp.path}"
                alt={wp.name}
                class="w-full h-full object-cover"
                loading="lazy"
                onerror={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
              />
            </button>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-muted-foreground">No wallpapers found in /usr/share/backgrounds or ~/Pictures</p>
      {/if}
    </div>

    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}

    {#if dirty}
      <div class="flex gap-2">
        <button
          onclick={save}
          disabled={saving}
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium
                 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {#if saving}<RefreshCw size={12} class="animate-spin" />{/if}
          Apply
        </button>
        <button
          onclick={load}
          disabled={saving}
          class="px-4 py-1.5 rounded-md text-sm bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    {/if}

  </div>
{/if}
