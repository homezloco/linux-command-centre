# Linux Command Centre

A desktop hardware management dashboard for Ubuntu/Linux, built with Electron + Svelte 5.

## Features

| Module | What it does |
|---|---|
| **Battery** | Charge level, status, health, and charge-stop threshold |
| **Thermal** | CPU temperatures, fan RPM, turbo boost state (live stream via WebSocket) |
| **Power** | Power profile switching via `powerprofilesctl` or ACPI sysfs |
| **Display** | Backlight brightness, GNOME night light toggle and temperature |
| **Audio** | Volume control and mute toggle via WirePlumber (`wpctl`) |
| **Wi-Fi** | Status, network scan, connect/disconnect, soft-block toggle |
| **Bluetooth** | Paired devices, scan, pair, connect/disconnect, soft-block toggle |
| **Touchpad** | Detect and rebind the Goodix GXTP7863 touchpad via i2c |
| **Startup** | Manage autostart `.desktop` entries (user + system) |
| **Updates** | Kernel version check, apt package updates, GitHub issue tracking |
| **Services** | List, search, start, stop, enable, disable, restart systemd services |

## Architecture

```
src/
├── main/
│   ├── index.ts          # Electron main process, window creation
│   ├── ipc.ts            # All IPC handlers (system reads, nmcli, bluetoothctl, etc.)
│   ├── privilege.ts      # pkexec bridge → lcc-helper
│   ├── shell.ts          # sysfs read/write helpers
│   └── stream-server.ts  # WebSocket server (localhost:52341) for live thermal/battery
├── preload/
│   └── index.ts          # Electron preload / context bridge
└── renderer/
    └── src/
        ├── App.svelte     # Sidebar nav + panel switcher
        └── modules/       # One Svelte component per feature panel
helper/
└── lcc-helper.js         # Privileged helper — runs as root via pkexec
```

### Privileged operations

Actions that require root write access run through `lcc-helper.js` via `pkexec`, which triggers the native GNOME Polkit authentication dialog. The helper accepts only a strict whitelist of operations:

| Operation | What it does |
|---|---|
| `set-battery-threshold` | Write `charge_control_end_threshold` (50–100%) |
| `set-brightness` | Write to `/sys/class/backlight/*/brightness` |
| `wifi-toggle` | `rfkill block/unblock wifi` |
| `bluetooth-toggle` | `rfkill block/unblock bluetooth` |
| `touchpad-rebind` | Unbind/rebind `i2c-GXTP7863:00` via i2c_hid_acpi |
| `set-sleep-state` | Write `s2idle` or `deep` to `/sys/power/mem_sleep` |
| `set-power-profile` | Write ACPI platform_profile |
| `grub-set` | Update `/etc/default/grub` and run `update-grub` |
| `service-action` | `systemctl start/stop/enable/disable/restart <service>` |

### Live data streaming

A WebSocket server runs on `ws://127.0.0.1:52341`. The renderer subscribes to channels:

- **`thermal`** — CPU temps, fan RPM, CPU frequency range, turbo state (every 2 s)
- **`battery`** — capacity and charge status (every 10 s)

### System tool dependencies

| Tool | Used for |
|---|---|
| `wpctl` | Audio volume and mute (WirePlumber) |
| `nmcli` | Wi-Fi status, scan, connect/disconnect |
| `rfkill` | Wi-Fi and Bluetooth soft-block |
| `bluetoothctl` | Bluetooth device management |
| `powerprofilesctl` | Power profile switching (falls back to ACPI sysfs) |
| `gsettings` | GNOME night light settings |
| `systemctl` | Service management |
| `pkexec` | Privilege escalation for root operations |
| `uname`, `dpkg`, `apt-cache` | Kernel and package update checks |

## Development

```bash
npm install
npm run dev        # Electron + Vite dev server with hot reload
npm run build      # Compile TypeScript + bundle renderer
npm run package    # Build and package as .deb and AppImage
```

Packaged artifacts go to `out/`. Distribution targets: `.deb` and `.AppImage` (Linux only).

## Tech stack

- [Electron](https://www.electronjs.org/) 33
- [Svelte](https://svelte.dev/) 5
- [electron-vite](https://electron-vite.org/) for build tooling
- [TanStack Query](https://tanstack.com/query) for data fetching
- [Tailwind CSS](https://tailwindcss.com/) 3 + [bits-ui](https://bits-ui.com/)
- [uPlot](https://github.com/leeoniya/uPlot) for thermal charts
- [ws](https://github.com/websockets/ws) for the local WebSocket stream server
