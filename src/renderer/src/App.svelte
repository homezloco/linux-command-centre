<script lang="ts">
  import { Battery, Thermometer, Wifi, Bluetooth, Volume2, Monitor,
           Zap, Mouse, Camera, Moon, RefreshCw, Info, LayoutGrid, Shield,
           HardDrive, Server, Network, Activity } from 'lucide-svelte'
  import BatteryPanel from './modules/battery/BatteryPanel.svelte'
  import ThermalPanel from './modules/thermal/ThermalPanel.svelte'
  import WifiPanel from './modules/wifi/WifiPanel.svelte'
  import BluetoothPanel from './modules/bluetooth/BluetoothPanel.svelte'
  import AudioPanel from './modules/audio/AudioPanel.svelte'
  import DisplayPanel from './modules/display/DisplayPanel.svelte'
  import PowerPanel from './modules/power/PowerPanel.svelte'
  import TouchpadPanel from './modules/touchpad/TouchpadPanel.svelte'
  import UpdatesPanel from './modules/updates/UpdatesPanel.svelte'
  import StartupPanel from './modules/startup/StartupPanel.svelte'
  import SecurityPanel from './modules/security/SecurityPanel.svelte'
  import StoragePanel from './modules/storage/StoragePanel.svelte'
  import SystemPanel from './modules/system/SystemPanel.svelte'
  import NetworkPanel from './modules/network/NetworkPanel.svelte'
  import ProcessesPanel from './modules/processes/ProcessesPanel.svelte'

  type Module = {
    id: string
    label: string
    icon: typeof Battery
    component: typeof BatteryPanel
  }

  const modules: Module[] = [
    { id: 'system',    label: 'System',    icon: Server,      component: SystemPanel },
    { id: 'processes', label: 'Processes', icon: Activity,    component: ProcessesPanel },
    { id: 'network',   label: 'Network',   icon: Network,     component: NetworkPanel },
    { id: 'battery',   label: 'Battery',   icon: Battery,     component: BatteryPanel },
    { id: 'thermal',   label: 'Thermal',   icon: Thermometer, component: ThermalPanel },
    { id: 'power',     label: 'Power',     icon: Zap,         component: PowerPanel },
    { id: 'display',   label: 'Display',   icon: Monitor,     component: DisplayPanel },
    { id: 'audio',     label: 'Audio',     icon: Volume2,     component: AudioPanel },
    { id: 'wifi',      label: 'Wi-Fi',     icon: Wifi,        component: WifiPanel },
    { id: 'bluetooth', label: 'Bluetooth', icon: Bluetooth,   component: BluetoothPanel },
    { id: 'touchpad',  label: 'Touchpad',  icon: Mouse,       component: TouchpadPanel },
    { id: 'storage',   label: 'Storage',   icon: HardDrive,   component: StoragePanel },
    { id: 'security',  label: 'Security',  icon: Shield,      component: SecurityPanel },
    { id: 'startup',   label: 'Startup',   icon: LayoutGrid,  component: StartupPanel },
    { id: 'updates',   label: 'Updates',   icon: RefreshCw,   component: UpdatesPanel },
  ]

  let active = $state('system')
  const current = $derived(modules.find(m => m.id === active)!)
</script>

<div class="flex h-screen bg-background text-foreground overflow-hidden">
  <!-- Sidebar -->
  <aside class="w-52 flex flex-col border-r border-border bg-card shrink-0">
    <!-- Title bar drag region + app name -->
    <div class="drag-region flex items-center gap-2 px-4 h-10 border-b border-border">
      <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest no-drag">
        Command Centre
      </span>
    </div>

    <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto select-none">
      {#each modules as mod}
        <button
          onclick={() => active = mod.id}
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                 {active === mod.id
                   ? 'bg-primary/10 text-primary font-medium'
                   : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}"
        >
          <mod.icon size={15} />
          {mod.label}
        </button>
      {/each}
    </nav>

    <div class="p-3 border-t border-border">
      <p class="text-[10px] text-muted-foreground">Linux Command Centre</p>
      <p class="text-[10px] text-muted-foreground/50">v0.1.0 · Ubuntu 24.04</p>
    </div>
  </aside>

  <!-- Main panel -->
  <main class="flex-1 overflow-y-auto bg-background">
    <div class="drag-region h-10 border-b border-border flex items-center px-5">
      <span class="text-sm font-medium no-drag">{current.label}</span>
    </div>
    <div class="p-5">
      {#key active}
        <current.component />
      {/key}
    </div>
  </main>
</div>
