<script lang="ts">
  import { onMount } from 'svelte'
  import type { Component } from 'svelte'
  import { Battery, Thermometer, Wifi, Bluetooth, Volume2, Monitor,
           Zap, Mouse, RefreshCw, LayoutGrid, Shield, Keyboard,
           HardDrive, Server, Network, Activity, Usb, ScrollText,
           Lock, Clock, MousePointer, Paintbrush, Users, Wrench,
           Printer, ShieldCheck, Bell, Globe, AppWindow,
           Languages, Accessibility, FileText, Camera, KeyRound, CalendarClock,
           Globe2, FolderOpen, Gauge, Layers, Timer, Laptop, Pin,
           ChevronDown, ChevronRight } from 'lucide-svelte'
  import BatteryPanel    from './modules/battery/BatteryPanel.svelte'
  import ThermalPanel    from './modules/thermal/ThermalPanel.svelte'
  import WifiPanel       from './modules/wifi/WifiPanel.svelte'
  import BluetoothPanel  from './modules/bluetooth/BluetoothPanel.svelte'
  import AudioPanel      from './modules/audio/AudioPanel.svelte'
  import DisplayPanel    from './modules/display/DisplayPanel.svelte'
  import PowerPanel      from './modules/power/PowerPanel.svelte'
  import TouchpadPanel   from './modules/touchpad/TouchpadPanel.svelte'
  import UpdatesPanel    from './modules/updates/UpdatesPanel.svelte'
  import StartupPanel    from './modules/startup/StartupPanel.svelte'
  import SecurityPanel   from './modules/security/SecurityPanel.svelte'
  import StoragePanel    from './modules/storage/StoragePanel.svelte'
  import SystemPanel     from './modules/system/SystemPanel.svelte'
  import NetworkPanel    from './modules/network/NetworkPanel.svelte'
  import ProcessesPanel  from './modules/processes/ProcessesPanel.svelte'
  import LogsPanel       from './modules/logs/LogsPanel.svelte'
  import UsbPanel        from './modules/usb/UsbPanel.svelte'
  import VpnPanel        from './modules/vpn/VpnPanel.svelte'
  import KeyboardPanel   from './modules/keyboard/KeyboardPanel.svelte'
  import DateTimePanel   from './modules/datetime/DateTimePanel.svelte'
  import MousePanel       from './modules/mouse/MousePanel.svelte'
  import AppearancePanel   from './modules/appearance/AppearancePanel.svelte'
  import UsersPanel        from './modules/users/UsersPanel.svelte'
  import DefaultAppsPanel  from './modules/defaultapps/DefaultAppsPanel.svelte'
  import LocalePanel       from './modules/locale/LocalePanel.svelte'
  import AccessibilityPanel from './modules/accessibility/AccessibilityPanel.svelte'
  import HostsPanel        from './modules/hosts/HostsPanel.svelte'
  import CameraPanel       from './modules/camera/CameraPanel.svelte'
  import SSHPanel          from './modules/ssh/SSHPanel.svelte'
  import CrontabPanel      from './modules/crontab/CrontabPanel.svelte'
  import DnsPanel          from './modules/dns/DnsPanel.svelte'
  import MountsPanel       from './modules/mounts/MountsPanel.svelte'
  import ServicesPanel    from './modules/services/ServicesPanel.svelte'
  import PrintersPanel    from './modules/printers/PrintersPanel.svelte'
  import FirewallPanel    from './modules/firewall/FirewallPanel.svelte'
  import NotificationsPanel from './modules/notifications/NotificationsPanel.svelte'
  import ProxyPanel       from './modules/proxy/ProxyPanel.svelte'
  import SmartPanel       from './modules/smart/SmartPanel.svelte'
  import GrubPanel        from './modules/grub/GrubPanel.svelte'
  import TimersPanel      from './modules/timers/TimersPanel.svelte'
  import DevicePanel      from './modules/device/DevicePanel.svelte'
  import CommandPalette   from '$lib/CommandPalette.svelte'
  import Toaster          from '$lib/Toaster.svelte'
  import { SearchField } from '$ui'
  import { invoke }      from '$lib/utils'
  import { toasts }        from '$stores/toasts'
  import { appName, DEFAULT_APP_NAME } from '$stores/appName'
  import { openPalette } from '$stores/palette'
  import {
    active, collapsed, pins, recents,
    initNav, setActive, toggleCollapsed, togglePin, navCache,
  } from '$stores/nav'

  type PanelComponent = Component<{ visible?: boolean }>
  type Mod = {
    id: string
    label: string
    icon: typeof Battery
    component: PanelComponent
    keywords?: string[]
  }
  type Group = { label: string; items: Mod[] }

  const hoverBg = 'hover:bg-[hsl(var(--hover-overlay)/var(--hover-overlay-alpha))]'

  const groups: Group[] = [
    {
      label: 'Overview',
      items: [
        { id: 'system',    label: 'System info', icon: Server,   component: SystemPanel as PanelComponent,    keywords: ['specs', 'sysctl', 'lscpu', 'dmidecode'] },
        { id: 'processes', label: 'Processes',   icon: Activity, component: ProcessesPanel as PanelComponent, keywords: ['htop', 'top', 'ps', 'kill'] },
      ]
    },
    {
      label: 'Network',
      items: [
        { id: 'network',   label: 'Interfaces', icon: Network,     component: NetworkPanel as PanelComponent,    keywords: ['nmcli', 'ip', 'ifconfig', 'interfaces', 'nic'] },
        { id: 'vpn',       label: 'VPN',        icon: Lock,        component: VpnPanel as PanelComponent },
        { id: 'wifi',      label: 'Wi-Fi',      icon: Wifi,        component: WifiPanel as PanelComponent,       keywords: ['nmcli', 'ssid', 'wireless'] },
        { id: 'bluetooth', label: 'Bluetooth',  icon: Bluetooth,   component: BluetoothPanel as PanelComponent },
        { id: 'proxy',     label: 'Proxy',      icon: Globe,       component: ProxyPanel as PanelComponent },
        { id: 'firewall',  label: 'Firewall',   icon: ShieldCheck, component: FirewallPanel as PanelComponent,   keywords: ['ufw', 'iptables', 'nft'] },
        { id: 'dns',       label: 'DNS',        icon: Globe2,      component: DnsPanel as PanelComponent,        keywords: ['resolv', 'systemd-resolved', 'nameserver'] },
        { id: 'hosts',     label: 'Hosts',      icon: FileText,    component: HostsPanel as PanelComponent },
      ]
    },
    {
      label: 'Hardware',
      items: [
        { id: 'battery',   label: 'Battery',     icon: Battery,     component: BatteryPanel as PanelComponent },
        { id: 'thermal',   label: 'Thermal',     icon: Thermometer, component: ThermalPanel as PanelComponent },
        { id: 'display',   label: 'Display',     icon: Monitor,     component: DisplayPanel as PanelComponent },
        { id: 'audio',     label: 'Audio',       icon: Volume2,     component: AudioPanel as PanelComponent },
        { id: 'mouse',     label: 'Mouse',       icon: MousePointer,component: MousePanel as PanelComponent },
        { id: 'touchpad',  label: 'Touchpad',    icon: Mouse,       component: TouchpadPanel as PanelComponent },
        { id: 'keyboard',  label: 'Keyboard',    icon: Keyboard,    component: KeyboardPanel as PanelComponent },
        { id: 'usb',       label: 'USB',         icon: Usb,         component: UsbPanel as PanelComponent },
        { id: 'storage',   label: 'Storage',     icon: HardDrive,   component: StoragePanel as PanelComponent },
        { id: 'mounts',    label: 'Mounts',      icon: FolderOpen,  component: MountsPanel as PanelComponent },
        { id: 'smart',     label: 'Disk Health', icon: Gauge,       component: SmartPanel as PanelComponent },
        { id: 'printers',  label: 'Printers',    icon: Printer,     component: PrintersPanel as PanelComponent },
        { id: 'camera',    label: 'Camera',      icon: Camera,      component: CameraPanel as PanelComponent },
        { id: 'device',    label: 'Device',      icon: Laptop,      component: DevicePanel as PanelComponent },
      ]
    },
    {
      label: 'Settings',
      items: [
        { id: 'power',         label: 'Power',         icon: Zap,          component: PowerPanel as PanelComponent,         keywords: ['tuned', 'ppd', 'lid', 'idle'] },
        { id: 'security',      label: 'Security',      icon: Shield,       component: SecurityPanel as PanelComponent },
        { id: 'startup',       label: 'Startup',       icon: LayoutGrid,   component: StartupPanel as PanelComponent },
        { id: 'grub',          label: 'Boot Manager',  icon: Layers,       component: GrubPanel as PanelComponent,          keywords: ['boot', 'grub', 'kernel cmdline'] },
        { id: 'datetime',      label: 'Date & Time',   icon: Clock,        component: DateTimePanel as PanelComponent },
        { id: 'appearance',    label: 'Appearance',    icon: Paintbrush,   component: AppearancePanel as PanelComponent,    keywords: ['theme', 'gtk', 'wallpaper', 'light', 'dark', 'icons', 'cursor'] },
        { id: 'notifications',  label: 'Notifications', icon: Bell,          component: NotificationsPanel as PanelComponent },
        { id: 'users',          label: 'Users',         icon: Users,         component: UsersPanel as PanelComponent,        keywords: ['sudo', 'passwd', 'adduser'] },
        { id: 'defaultapps',    label: 'Default Apps',  icon: AppWindow,     component: DefaultAppsPanel as PanelComponent },
        { id: 'locale',         label: 'Language',      icon: Languages,     component: LocalePanel as PanelComponent },
        { id: 'accessibility',  label: 'Accessibility', icon: Accessibility, component: AccessibilityPanel as PanelComponent, keywords: ['a11y', 'contrast', 'orca', 'magnifier'] },
      ]
    },
    {
      label: 'Tools',
      items: [
        { id: 'updates',  label: 'Updates',  icon: RefreshCw,     component: UpdatesPanel as PanelComponent,  keywords: ['apt', 'dpkg', 'upgrade', 'unattended'] },
        { id: 'logs',     label: 'Logs',     icon: ScrollText,    component: LogsPanel as PanelComponent,     keywords: ['dmesg', 'journal', 'journalctl', 'syslog'] },
        { id: 'services', label: 'Services', icon: Wrench,        component: ServicesPanel as PanelComponent, keywords: ['systemd', 'systemctl', 'unit'] },
        { id: 'ssh',      label: 'SSH Keys', icon: KeyRound,      component: SSHPanel as PanelComponent,      keywords: ['sshd', 'keys'] },
        { id: 'crontab',  label: 'Crontab',  icon: CalendarClock, component: CrontabPanel as PanelComponent,  keywords: ['cron', 'at'] },
        { id: 'timers',   label: 'Timers',   icon: Timer,         component: TimersPanel as PanelComponent },
      ]
    },
  ]

  const allMods = groups.flatMap(g => g.items)
  const paletteItems = groups.flatMap(g => g.items.map(m => ({ ...m, group: g.label })))
  const modById = new Map(allMods.map((m) => [m.id, m]))
  const groupById = new Map(paletteItems.map((m) => [m.id, m.group]))
  const knownIds = new Set(allMods.map((m) => m.id))
  const componentById = new Map<string, PanelComponent>(allMods.map((m) => [m.id, m.component]))

  initNav(knownIds)

  const current = $derived(modById.get($active) ?? allMods[0])
  const cache = $derived(navCache($active, $pins, $recents, knownIds))
  // KD 14: Logs is the only fill page; every other panel uses the shell scroller.
  const pageFill = $derived($active === 'logs')

  let navQuery = $state('')
  const filtering = $derived(navQuery.trim().length > 0)

  function matchesQuery(mod: Mod, group: string, q: string): boolean {
    const nq = q.trim().toLowerCase()
    if (!nq) return true
    if (mod.label.toLowerCase().includes(nq)) return true
    if (group.toLowerCase().includes(nq)) return true
    return (mod.keywords ?? []).some((k) => k.toLowerCase().includes(nq))
  }

  function visibleItems(group: Group): Mod[] {
    return group.items.filter((m) => matchesQuery(m, group.label, navQuery))
  }

  const pinnedMods = $derived(
    $pins
      .map((id) => modById.get(id))
      .filter((m): m is Mod => !!m && matchesQuery(m, groupById.get(m.id) ?? '', navQuery)),
  )
  const recentMods = $derived(
    $recents
      .map((id) => modById.get(id))
      .filter((m): m is Mod => !!m && matchesQuery(m, groupById.get(m.id) ?? '', navQuery)),
  )

  function rowClass(isActive: boolean): string {
    return `relative w-full flex items-center gap-2.5 px-2.5 py-[5px] rounded-[5px] text-[13px] transition-colors
      ${isActive ? 'bg-primary/[0.12] text-primary font-medium' : `text-muted-foreground ${hoverBg} hover:text-foreground`}`
  }

  function onNavClick(e: MouseEvent, id: string) {
    e.preventDefault()
    setActive(id)
  }

  function onPinClick(e: MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!togglePin(id)) toasts.warning('Unpin one first')
  }

  type Wco = {
    visible?: boolean
    getTitlebarAreaRect?: () => DOMRect
    addEventListener: (type: 'geometrychange', listener: () => void) => void
    removeEventListener: (type: 'geometrychange', listener: () => void) => void
  }

  function syncWco(): void {
    const overlay = (navigator as Navigator & { windowControlsOverlay?: Wco }).windowControlsOverlay
    if (!overlay?.getTitlebarAreaRect) return
    if (overlay.visible === false) return
    const r = overlay.getTitlebarAreaRect()
    if (r.width === 0 && r.height === 0) return
    const right = Math.max(0, window.innerWidth - r.x - r.width)
    const left = Math.max(0, r.x)
    document.documentElement.style.setProperty('--wco-right', `${right}px`)
    document.documentElement.style.setProperty('--wco-left', `${left}px`)
  }

  // ── App info ──────────────────────────────────────────────────────────────
  let appVersion = $state('0.1.0')
  let appOs      = $state('Linux')

  // ── Sidebar badges ────────────────────────────────────────────────────────
  type Badges = { pendingUpdates: number; securityUpdates: number; highDisk: boolean; vpnActive: boolean }
  let badges = $state<Badges>({ pendingUpdates: 0, securityUpdates: 0, highDisk: false, vpnActive: false })
  let badgeInterval: ReturnType<typeof setInterval> | undefined

  async function refreshBadges() {
    try { badges = await invoke<Badges>('badge:counts') } catch { /* non-critical */ }
  }

  function badgeFor(id: string): string | null {
    if (id === 'updates'  && badges.pendingUpdates > 0)  return String(badges.pendingUpdates)
    if (id === 'security' && badges.securityUpdates > 0) return String(badges.securityUpdates)
    if (id === 'storage'  && badges.highDisk)            return '!'
    if (id === 'vpn'      && badges.vpnActive)           return '●'
    return null
  }

  function badgeStyle(id: string): string {
    return id === 'vpn' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
  }

  onMount(() => {
    syncWco()
    const overlay = (navigator as Navigator & { windowControlsOverlay?: Wco }).windowControlsOverlay
    overlay?.addEventListener('geometrychange', syncWco)

    void (async () => {
      try {
        const info = await invoke<{ version: string; osName: string }>('app:info')
        appVersion = info.version
        appOs = info.osName.replace(/\s+\d[\d.]*$/, '')
      } catch { /* defaults */ }
    })()

    refreshBadges()
    badgeInterval = setInterval(refreshBadges, 5 * 60 * 1000)

    return () => {
      overlay?.removeEventListener('geometrychange', syncWco)
      clearInterval(badgeInterval)
    }
  })
</script>

<CommandPalette items={paletteItems} onselect={(id) => setActive(id)} />

<div class="flex h-screen bg-background text-foreground overflow-hidden">
  <!-- Sidebar -->
  <aside class="w-52 flex flex-col border-r border-border shrink-0" style="background: hsl(var(--sidebar-bg));">
    <div class="sidebar-brand drag-region flex items-center gap-2.5 pr-4 h-11 border-b border-border shrink-0">
      <Shield size={13} class="text-primary/70 no-drag shrink-0" />
      <span
        title={$appName.trim() || DEFAULT_APP_NAME}
        class="min-w-0 truncate text-[11px] font-semibold text-foreground/70 uppercase tracking-widest no-drag leading-none"
      >
        {$appName.trim() || DEFAULT_APP_NAME}
      </span>
    </div>

    <nav aria-label="Modules" class="flex-1 min-h-0 py-2 overflow-y-auto">
      <div class="px-1.5 pb-2">
        <SearchField
          value={navQuery}
          onChange={(v) => (navQuery = v)}
          placeholder="Search"
          aria-label="Filter modules"
        />
      </div>

      <ul class="space-y-4 px-1.5 select-none">
        {#if pinnedMods.length}
          <li>
            <p class="px-2.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Pinned
            </p>
            <ul class="space-y-px">
              {#each pinnedMods as mod (mod.id)}
                {@const badge = badgeFor(mod.id)}
                {@const isActive = $active === mod.id}
                <li>
                  <a
                    href="#{mod.id}"
                    onclick={(e) => onNavClick(e, mod.id)}
                    class={rowClass(isActive)}
                  >
                    <mod.icon size={14} class="shrink-0" />
                    <span class="flex-1 text-left truncate">{mod.label}</span>
                    {#if badge}
                      <span class="text-[10px] font-bold px-1.5 py-px rounded-full leading-none shrink-0
                                   {badgeStyle(mod.id)}">
                        {badge}
                      </span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </li>
        {/if}

        {#if recentMods.length}
          <li>
            <p class="px-2.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Recent
            </p>
            <ul class="space-y-px">
              {#each recentMods as mod (mod.id)}
                {@const badge = badgeFor(mod.id)}
                {@const isActive = $active === mod.id}
                <li>
                  <a
                    href="#{mod.id}"
                    onclick={(e) => onNavClick(e, mod.id)}
                    class={rowClass(isActive)}
                  >
                    <mod.icon size={14} class="shrink-0" />
                    <span class="flex-1 text-left truncate">{mod.label}</span>
                    {#if badge}
                      <span class="text-[10px] font-bold px-1.5 py-px rounded-full leading-none shrink-0
                                   {badgeStyle(mod.id)}">
                        {badge}
                      </span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </li>
        {/if}

        {#each groups as group}
          {@const items = visibleItems(group)}
          {@const isCollapsed = $collapsed.includes(group.label)}
          {#if !filtering || items.length}
            <li>
              <button
                type="button"
                aria-expanded={filtering || !isCollapsed}
                onclick={() => toggleCollapsed(group.label)}
                class="flex w-full items-center gap-1 px-2.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground {hoverBg} rounded-[5px]"
              >
                {#if isCollapsed}
                  <ChevronRight size={12} class="shrink-0" />
                {:else}
                  <ChevronDown size={12} class="shrink-0" />
                {/if}
                <span class="truncate">{group.label}</span>
              </button>
              {#if filtering || !isCollapsed}
                <ul class="space-y-px">
                  {#each items as mod (mod.id)}
                    {@const badge = badgeFor(mod.id)}
                    {@const isActive = $active === mod.id}
                    {@const pinned = $pins.includes(mod.id)}
                    <li class="group/row relative flex items-center">
                      <a
                        href="#{mod.id}"
                        aria-current={isActive ? 'page' : undefined}
                        onclick={(e) => onNavClick(e, mod.id)}
                        class="{rowClass(isActive)} pr-7"
                      >
                        {#if isActive}
                          <span class="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary"></span>
                        {/if}
                        <mod.icon size={14} class="shrink-0" />
                        <span class="flex-1 text-left truncate">{mod.label}</span>
                        {#if badge}
                          <span class="text-[10px] font-bold px-1.5 py-px rounded-full leading-none shrink-0
                                       {badgeStyle(mod.id)}">
                            {badge}
                          </span>
                        {/if}
                      </a>
                      <button
                        type="button"
                        aria-label={pinned ? `Unpin ${mod.label}` : `Pin ${mod.label}`}
                        aria-pressed={pinned}
                        onclick={(e) => onPinClick(e, mod.id)}
                        class="absolute right-1 z-10 rounded p-0.5 text-muted-foreground {hoverBg} hover:text-foreground
                               {pinned
                                 ? 'opacity-100 text-primary'
                                 : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'}"
                      >
                        <Pin size={12} class={pinned ? 'fill-current' : ''} />
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>
    </nav>

    <div class="px-3 py-2.5 border-t border-border shrink-0 flex items-center gap-2">
      <div class="w-5 h-5 rounded bg-primary/15 flex items-center justify-center shrink-0">
        <Server size={10} class="text-primary/80" />
      </div>
      <div class="min-w-0">
        <p class="text-[10px] font-medium text-foreground/60 truncate">{appOs}</p>
        <p class="text-[11px] text-muted-foreground">v{appVersion}</p>
      </div>
    </div>
  </aside>

  <!-- Main panel -->
  <main class="flex-1 flex flex-col overflow-hidden bg-background">
    <header class="app-header drag-region shrink-0 border-b border-border flex items-center gap-3 pl-5">
      <div class="no-drag flex items-center gap-2.5 flex-1 min-w-0">
        <div class="w-6 h-6 rounded-md bg-card border border-border flex items-center justify-center shrink-0">
          <current.icon size={13} class="text-primary/80" />
        </div>
        <h1 tabindex="-1" class="text-[13px] font-semibold text-foreground truncate">{current.label}</h1>
      </div>
      <button
        type="button"
        id="lcc-palette-chip"
        class="no-drag shrink-0 text-[11px] text-muted-foreground border border-border/40 rounded px-1.5 py-0.5 font-mono hover:text-foreground hover:border-border"
        aria-label="Open command palette"
        aria-keyshortcuts="Control+K"
        onclick={() => openPalette()}
      >
        Ctrl+K
      </button>
    </header>
    <div class="page-zoom flex-1 min-h-0 flex flex-col relative" style="zoom: var(--ui-scale, 1)">
      <div
        class="page-body flex-1 min-h-0 {pageFill
          ? 'overflow-hidden px-5 pt-5 pb-0'
          : 'overflow-y-auto p-5'}"
      >
        {#each cache as id (id)}
          {@const Comp = componentById.get(id)}
          {#if Comp}
            <div
              hidden={$active !== id}
              inert={$active !== id}
              class={id === 'logs' ? 'h-full min-h-0' : undefined}
            >
              <Comp visible={$active === id} />
            </div>
          {/if}
        {/each}
      </div>
      <div id="lcc-overlay-root" class="absolute inset-0 pointer-events-none z-50"></div>
    </div>
  </main>
</div>

<Toaster />
