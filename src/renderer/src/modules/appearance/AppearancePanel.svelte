<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke, debounce } from '$lib/utils'
  import { toasts } from '$stores/toasts'
  import { RefreshCw, Palette, Sun, Moon, Monitor, Type, MousePointer2, ImageIcon, Sparkles, AppWindow } from 'lucide-svelte'
  import Alert from '$lib/Alert.svelte'
  import { theme, THEMES, uiScale, userReduceFlag, osPrefersReducedMotion, reduceEffects, type UiScale } from '$stores/theme'
  import { appName, DEFAULT_APP_NAME } from '$stores/appName'
  import { Page, Card, Skeleton, Button, Listbox, SegmentedControl, type Segment } from '$ui'

  const TITLE = 'Appearance'

  const UI_SCALE_OPTIONS: Segment<UiScale>[] = [
    { value: '1', label: '100%' },
    { value: '1.1', label: '110%' },
    { value: '1.25', label: '125%' },
    { value: '1.5', label: '150%' },
  ]

  type AppearanceStatus = {
    colorScheme: string; gtkTheme: string; iconTheme: string
    cursorTheme: string; fontName: string; textScale: number; cursorSize: number
    availableThemes: string[]; availableIcons: string[]
    wallpaper: string
  }
  type AppearanceOpts = Partial<Omit<AppearanceStatus, 'availableThemes' | 'availableIcons' | 'fontName'>>

  type WallpaperEntry = { path: string; name: string }

  let status  = $state<AppearanceStatus | null>(null)
  let loading = $state(true)
  let refreshing = $state(false)
  let error   = $state('')

  // Editable copies — every GNOME control saves instantly (appearance:set accepts partial opts)
  let colorScheme  = $state('default')
  let gtkTheme     = $state('')
  let iconTheme    = $state('')
  let textScale    = $state(1.0)
  let cursorSize   = $state(24)
  let wallpaper    = $state('')
  let wallpapers   = $state<WallpaperEntry[]>([])
  let wpLoading    = $state(false)

  const COLOR_SCHEMES = [
    { value: 'default',        label: 'System default', icon: Monitor },
    { value: 'prefer-light',   label: 'Light',          icon: Sun     },
    { value: 'prefer-dark',    label: 'Dark',           icon: Moon    },
  ]

  const CURSOR_SIZES = [16, 24, 32, 48, 64]
  const CURSOR_OPTIONS = CURSOR_SIZES.map(s => ({ value: String(s), label: `${s}px` }))

  const gtkOptions = $derived((status?.availableThemes ?? []).map(t => ({ value: t, label: t })))
  const iconOptions = $derived((status?.availableIcons ?? []).map(t => ({ value: t, label: t })))

  async function load(force = false) {
    if (force) refreshing = true
    error = ''
    try {
      status = await invoke<AppearanceStatus>('appearance:status')
      colorScheme = status.colorScheme
      gtkTheme    = status.gtkTheme
      iconTheme   = status.iconTheme
      textScale   = status.textScale
      cursorSize  = status.cursorSize
      // Ensure wallpaper has file:// prefix for <img> display
      const wp = status.wallpaper || ''
      wallpaper = wp && !wp.startsWith('file://') ? `file://${wp}` : wp
    } catch (e) { error = String(e) }
    finally { loading = false; refreshing = false }
  }

  async function apply(opts: AppearanceOpts) {
    try { await invoke('appearance:set', opts) }
    catch (e) {
      toasts.error(String(e), TITLE)
      await load(true) // revert the control to what the desktop actually has
    }
  }

  const pushTextScale = debounce((v: number) => { void apply({ textScale: v }) })

  async function loadWallpapers() {
    wpLoading = true
    try { wallpapers = await invoke<WallpaperEntry[]>('appearance:listWallpapers') }
    catch { wallpapers = [] }
    finally { wpLoading = false }
  }

  onMount(() => { void load(); void loadWallpapers() })
</script>

<Page width="narrow">
  {#snippet actions()}
    <Button
      variant="icon"
      size="sm"
      aria-label="Reload appearance settings"
      disabled={refreshing || loading}
      onclick={() => load(true)}
    >
      <RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if error}
      <Alert message={error} />
    {/if}

    <!-- ── This app ─────────────────────────────────────────────────────── -->
    <Card class="space-y-4">
      <div>
        <p class="text-[13px] font-semibold flex items-center gap-2">
          <AppWindow size={14} class="text-muted-foreground" /> This app
        </p>
        <p class="text-xs text-muted-foreground mt-0.5">Cosmetic settings for Command Centre only. Every control applies instantly.</p>
      </div>

      <div class="space-y-2">
        <p class="text-[13px] font-medium flex items-center gap-2" id="pack-label">
          <Sparkles size={14} class="text-muted-foreground" /> Style pack
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-labelledby="pack-label">
          {#each THEMES as t (t.id)}
            <button
              type="button"
              role="radio"
              aria-checked={$theme === t.id}
              onclick={() => { $theme = t.id }}
              class="flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors
                     {$theme === t.id
                       ? 'border-primary/40 bg-primary/10'
                       : 'border-border hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'}"
            >
              <span class="flex -space-x-1.5 shrink-0" aria-hidden="true">
                {#each t.swatch as c, i (i)}
                  <span class="w-3.5 h-3.5 rounded-full border border-black/30" style="background:{c}"></span>
                {/each}
              </span>
              <span class="min-w-0">
                <span class="block text-xs font-medium truncate {$theme === t.id ? 'text-primary' : 'text-foreground'}">
                  {t.label}
                </span>
                <span class="block text-[11px] text-muted-foreground truncate">{t.tagline}</span>
              </span>
            </button>
          {/each}
        </div>
      </div>

      <div class="border-t border-border"></div>

      <div class="space-y-2">
        <p class="text-[13px] font-medium">Command Centre text size</p>
        <SegmentedControl
          value={$uiScale}
          onChange={(v) => { $uiScale = v }}
          ariaLabel="Command Centre text size"
          options={UI_SCALE_OPTIONS}
        />
      </div>

      <label class="flex items-start gap-2.5">
        <input
          type="checkbox"
          class="mt-0.5 accent-primary"
          checked={$reduceEffects}
          disabled={$osPrefersReducedMotion}
          onchange={(e) => { $userReduceFlag = e.currentTarget.checked }}
        />
        <span>
          <span class="block text-[13px]">Reduce visual effects</span>
          {#if $osPrefersReducedMotion}
            <span class="block text-xs text-muted-foreground">Required by the desktop (Reduce animations)</span>
          {/if}
        </span>
      </label>

      <div class="border-t border-border"></div>

      <div class="space-y-2">
        <label for="app-name" class="text-[13px] font-medium flex items-center gap-2">
          <Type size={14} class="text-muted-foreground" /> Header name
        </label>
        <p class="text-xs text-muted-foreground -mt-1">Label shown at the top of the sidebar, in place of “{DEFAULT_APP_NAME}”.</p>
        <div class="flex gap-2">
          <input
            id="app-name"
            type="text"
            bind:value={$appName}
            maxlength="60"
            placeholder={DEFAULT_APP_NAME}
            class="flex-1 min-w-0 h-8 rounded-md border border-border bg-secondary/50 px-3 text-[13px]
                   focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {#if $appName.trim() && $appName.trim() !== DEFAULT_APP_NAME}
            <Button variant="secondary" size="sm" onclick={() => { $appName = DEFAULT_APP_NAME }}>Reset</Button>
          {/if}
        </div>
      </div>
    </Card>

    <!-- ── Desktop (GNOME) ──────────────────────────────────────────────── -->
    {#if loading}
      <Skeleton class="h-96 w-full" />
    {:else if status}
      <Card class="space-y-4">
        <div>
          <p class="text-[13px] font-semibold flex items-center gap-2">
            <Monitor size={14} class="text-muted-foreground" /> Desktop (GNOME)
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">System-wide GNOME settings. Every control applies instantly.</p>
        </div>

        <!-- Colour scheme -->
        <div class="space-y-2">
          <p class="text-[13px] font-medium" id="scheme-label">Color scheme</p>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="scheme-label">
            {#each COLOR_SCHEMES as scheme (scheme.value)}
              <button
                type="button"
                role="radio"
                aria-checked={colorScheme === scheme.value}
                onclick={() => { colorScheme = scheme.value; void apply({ colorScheme: scheme.value }) }}
                class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors
                       {colorScheme === scheme.value
                         ? 'border-primary/40 bg-primary/10 text-primary'
                         : 'border-border hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))] text-muted-foreground'}"
              >
                <scheme.icon size={18} />
                <span class="text-xs">{scheme.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="border-t border-border"></div>

        <!-- GTK / icon themes -->
        <div class="grid grid-cols-2 gap-3">
          {#if gtkOptions.length > 0}
            <div class="space-y-1">
              <label for="gtk-theme" class="text-xs text-muted-foreground flex items-center gap-1.5">
                <Palette size={12} /> GTK theme
              </label>
              <Listbox id="gtk-theme" filterable value={gtkTheme} options={gtkOptions}
                onChange={(v) => { gtkTheme = v; void apply({ gtkTheme: v }) }} />
            </div>
          {/if}
          {#if iconOptions.length > 0}
            <div class="space-y-1">
              <label for="icon-theme" class="text-xs text-muted-foreground flex items-center gap-1.5">
                <Palette size={12} /> Icon theme
              </label>
              <Listbox id="icon-theme" filterable value={iconTheme} options={iconOptions}
                onChange={(v) => { iconTheme = v; void apply({ iconTheme: v }) }} />
            </div>
          {/if}
        </div>

        <div class="border-t border-border"></div>

        <!-- Desktop text scale -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="gnome-text-scale" class="text-[13px] font-medium flex items-center gap-2">
              <Type size={14} class="text-muted-foreground" /> Desktop text scale (GNOME)
            </label>
            <span class="text-[13px] font-medium tabular-nums">{textScale.toFixed(2)}×</span>
          </div>
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>0.75×</span><span>1.00×</span><span>1.50×</span><span>2.00×</span>
          </div>
          <input
            id="gnome-text-scale"
            type="range" min="0.75" max="2.0" step="0.05"
            bind:value={textScale}
            oninput={() => pushTextScale(textScale)}
            aria-valuetext="{textScale.toFixed(2)}×"
            class="w-full accent-primary"
          />
        </div>

        <div class="border-t border-border"></div>

        <!-- Cursor size -->
        <div class="space-y-2">
          <p class="text-[13px] font-medium flex items-center gap-2">
            <MousePointer2 size={14} class="text-muted-foreground" /> Cursor size
          </p>
          <SegmentedControl
            value={String(cursorSize)}
            options={CURSOR_OPTIONS}
            ariaLabel="Cursor size"
            onChange={(v) => { cursorSize = parseInt(v); void apply({ cursorSize: parseInt(v) }) }}
          />
        </div>

        <div class="border-t border-border"></div>

        <div class="flex items-center justify-between text-[13px]">
          <p class="text-muted-foreground">System font</p>
          <p class="font-medium">{status.fontName}</p>
        </div>

        <div class="border-t border-border"></div>

        <!-- Wallpaper -->
        <div class="space-y-3">
          <p class="text-[13px] font-medium flex items-center gap-2">
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
              <div class="absolute bottom-1 right-1 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded font-mono truncate max-w-[80%]">
                {wallpaper.replace(/^.*\//, '')}
              </div>
            </div>
          {/if}

          {#if wpLoading}
            <div class="grid grid-cols-4 gap-2">
              {#each [0, 1, 2, 3] as i (i)}
                <Skeleton class="aspect-video w-full" />
              {/each}
            </div>
          {:else if wallpapers.length > 0}
            <div class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
              {#each wallpapers as wp (wp.path)}
                {@const isActive = wallpaper === `file://${wp.path}` || wallpaper === wp.path}
                <button
                  type="button"
                  onclick={() => { wallpaper = `file://${wp.path}`; void apply({ wallpaper: `file://${wp.path}` }) }}
                  title={wp.name}
                  aria-label="Use wallpaper {wp.name}"
                  aria-pressed={isActive}
                  class="relative rounded-md overflow-hidden border-2 aspect-video transition-colors
                         {isActive ? 'border-primary' : 'border-transparent hover:border-border'}"
                >
                  <img
                    src="file://{wp.path}"
                    alt=""
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
      </Card>
    {/if}
  </div>
</Page>
