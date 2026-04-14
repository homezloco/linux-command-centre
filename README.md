# Linux Command Centre

A desktop system management dashboard for Ubuntu/Linux, built with Electron + Svelte 5.

## Modules

### Overview

| Module | What it does |
|---|---|
| **System** | CPU, memory, uptime, OS/kernel info |
| **Processes** | Live process list with search, sort, kill |

### Network

| Module | What it does |
|---|---|
| **Network** | Interface status, IP addresses, live up/down speed |
| **VPN** | NetworkManager VPN connections — connect/disconnect |
| **Wi-Fi** | Status, scan, connect/disconnect, soft-block toggle |
| **Bluetooth** | Paired devices, scan, pair, connect/disconnect, soft-block |
| **Proxy** | GNOME proxy settings — none/manual/auto (PAC), per-protocol config |
| **Firewall** | UFW rule list, add/delete rules, enable/disable |
| **DNS** | systemd-resolved status, global DNS servers, per-link DNS, presets |
| **Hosts** | `/etc/hosts` editor with entry toggle, add/remove, system entry protection |

### Hardware

| Module | What it does |
|---|---|
| **Battery** | Charge level, status, health, wear, charge-stop threshold |
| **Thermal** | CPU temperatures, fan RPM, turbo boost state (live stream) |
| **Display** | Backlight brightness, GNOME night light toggle and temperature |
| **Audio** | Volume control and mute via WirePlumber (`wpctl`) |
| **Mouse** | Acceleration profile, speed, natural scroll via `libinput` |
| **Touchpad** | Detect and rebind GXTP7863 touchpad via i2c |
| **Keyboard** | Layout, repeat rate, Caps/Num lock state |
| **USB** | Connected USB devices via `lsusb` |
| **Storage** | Block devices, partition table, filesystem usage |
| **Mounts** | Live mount points with usage bars, fstab entries |
| **Disk Health** | SMART data via `smartctl` — health status, temperature, attributes, NVMe log |
| **Printers** | CUPS printer list, default printer, delete printers |
| **Camera** | V4L2 devices, formats, controls (brightness, contrast, etc.) |

### System

| Module | What it does |
|---|---|
| **Power** | Power profile switching (`powerprofilesctl` or ACPI sysfs), sleep state |
| **Security** | Firewall status, disk encryption, secure boot, AppArmor |
| **Startup** | Autostart `.desktop` entries (user + system) |
| **Boot Manager** | GRUB timeout, default entry, kernel parameters — runs `update-grub` |
| **Date & Time** | Timezone picker, NTP toggle |
| **Appearance** | GNOME theme, icon theme, colour scheme, font scaling |
| **Notifications** | Do Not Disturb toggle, lock screen notifications |
| **Users** | System user list, add/delete users, toggle sudo |
| **Default Apps** | XDG MIME default applications per category |
| **Language** | System locale (`localectl`), searchable picker |
| **Accessibility** | Vision, keyboard, mouse, and alert accessibility options via `gsettings` |

### Tools

| Module | What it does |
|---|---|
| **Updates** | Kernel version, apt package updates, GitHub issue tracking |
| **Logs** | `journalctl` log viewer with unit filter and log level filter |
| **Services** | Search, start, stop, enable, disable, restart systemd services |
| **SSH Keys** | Key list with fingerprints, generate new keys, delete, copy public key |
| **Crontab** | Visual crontab editor — add/remove/toggle jobs, humanised schedule preview |
| **Timers** | Systemd timer list — next/last trigger, start/stop, enable/disable |

## Architecture

```
src/
├── main/
│   ├── index.ts          # Electron main process, window creation
│   ├── ipc.ts            # All IPC handlers (~2800 lines)
│   ├── privilege.ts      # pkexec bridge → lcc-helper
│   ├── shell.ts          # sysfs read/write helpers
│   └── stream-server.ts  # WebSocket server (localhost:52341) for live thermal/battery
├── preload/
│   └── index.ts          # Electron preload / context bridge
└── renderer/
    └── src/
        ├── App.svelte     # Sidebar nav + panel switcher
        ├── lib/
        │   ├── utils.ts         # invoke() wrapper
        │   └── CommandPalette.svelte  # Ctrl+K quick-nav
        └── modules/       # One Svelte component per feature panel (40 total)
helper/
└── lcc-helper.js         # Privileged helper — runs as root via pkexec
```

### Privileged operations

Actions requiring root write access run through `lcc-helper.js` via `pkexec`, which triggers the native GNOME Polkit authentication dialog. The helper accepts only a strict whitelist of operations with validated arguments:

| Operation | What it does |
|---|---|
| `set-battery-threshold` | Write `charge_control_end_threshold` (50–100%) |
| `set-brightness` | Write to `/sys/class/backlight/*/brightness` |
| `wifi-toggle` | `rfkill block/unblock wifi` |
| `bluetooth-toggle` | `rfkill block/unblock bluetooth` |
| `touchpad-rebind` | Unbind/rebind `i2c-GXTP7863:00` via i2c_hid_acpi |
| `set-sleep-state` | Write `s2idle` or `deep` to `/sys/power/mem_sleep` |
| `set-power-profile` | Write ACPI `platform_profile` |
| `grub-set` | Update `/etc/default/grub` and run `update-grub` |
| `service-action` | `systemctl start/stop/enable/disable/restart` (`.service` and `.timer`) |
| `set-timezone` | `timedatectl set-timezone` |
| `set-ntp` | `timedatectl set-ntp` |
| `vpn-up` / `vpn-down` | `nmcli connection up/down` |
| `firewall-action` | `ufw enable/disable` |
| `firewall-status` | `ufw status numbered` |
| `firewall-rule-add` | `ufw allow/deny/reject <port>/<proto>` |
| `firewall-delete-rule` | `ufw --force delete <num>` |
| `kill-process` | `kill -TERM/-KILL <pid>` |
| `apt-upgrade` / `apt-upgrade-all` | `apt-get install --only-upgrade` / `apt-get upgrade` |
| `user-add` | `useradd -m` |
| `user-delete` | `userdel -r` |
| `user-toggle-sudo` | `usermod -aG sudo` / `gpasswd -d sudo` |
| `printer-delete` | `lpadmin -x` |
| `set-locale` | `localectl set-locale` |
| `hosts-write` | Validate and overwrite `/etc/hosts` via temp file |
| `resolv-write` | Validate and overwrite `/etc/resolv.conf` via temp file (unlinks systemd symlink) |
| `smart-info` | `smartctl --json=c -a <device>` — handles non-zero exit codes (SMART threshold exceeded etc.) |

### Live data streaming

A WebSocket server runs on `ws://127.0.0.1:52341`. The renderer subscribes to channels:

- **`thermal`** — CPU temps, fan RPM, CPU frequency range, turbo state (every 2 s)
- **`battery`** — capacity and charge status (every 10 s)
- **`network`** — per-interface byte counters for live speed calculation (every 1 s)

### System tool dependencies

| Tool | Used by |
|---|---|
| `wpctl` | Audio (WirePlumber volume/mute) |
| `nmcli` | Network, Wi-Fi, VPN |
| `rfkill` | Wi-Fi and Bluetooth soft-block |
| `bluetoothctl` | Bluetooth device management |
| `powerprofilesctl` | Power profiles (falls back to ACPI sysfs) |
| `gsettings` | Appearance, notifications, proxy, accessibility, locale |
| `systemctl` | Services, timers, startup |
| `ufw` | Firewall |
| `timedatectl` / `localectl` | Date & time, language |
| `pkexec` | Privilege escalation |
| `lsblk` | Storage, mounts, disk health device listing |
| `smartctl` | Disk health SMART data (`smartmontools` package) |
| `lsusb` | USB devices |
| `v4l2-ctl` | Camera controls |
| `lpadmin` / `lpstat` / `lpoptions` | Printers (CUPS) |
| `ssh-keygen` | SSH key generation and fingerprints |
| `crontab` | Crontab read/write |
| `xdg-mime` | Default application associations |
| `resolvectl` | DNS status (systemd-resolved) |
| `uname` / `dpkg` / `apt-cache` / `apt-get` | Updates |
| `journalctl` | Logs |
| `df` / `lsblk` / `fdisk` | Storage and mounts |
| `useradd` / `userdel` / `usermod` / `gpasswd` | User management |
| `update-grub` | GRUB boot manager |

## Development

```bash
npm install
npm run dev        # Electron + Vite dev server with hot reload
npm run build      # Compile TypeScript + bundle renderer
npm run package    # Build and package as .deb and AppImage
```

Packaged artifacts go to `out/`. Distribution targets: `.deb` and `.AppImage` (Linux only).

### Installing the privileged helper

The helper must be installed to `/usr/lib/lcc-helper.js` for privileged operations to work:

```bash
sudo cp helper/lcc-helper.js /usr/lib/lcc-helper.js
sudo chmod 755 /usr/lib/lcc-helper.js
```

A polkit policy file is also required (see `resources/` in packaged builds). In development, `pkexec` will prompt for credentials using the installed policy.

## Tech stack

- [Electron](https://www.electronjs.org/) 33
- [Svelte](https://svelte.dev/) 5 (runes mode)
- [electron-vite](https://electron-vite.org/) for build tooling
- [Tailwind CSS](https://tailwindcss.com/) 3
- [lucide-svelte](https://lucide.dev/) for icons
- [ws](https://github.com/websockets/ws) for the local WebSocket stream server
