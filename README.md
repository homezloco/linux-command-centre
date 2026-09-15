# Linux Command Centre

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Homezloco/linux-command-centre)](https://github.com/Homezloco/linux-command-centre/releases/latest)

A desktop system management dashboard for Ubuntu/Linux, built with Electron 44 + Svelte 5.

## Installation

**Direct download** (available now): grab `.deb`, `.rpm`, or `.tar.gz` from the [latest release](https://github.com/Homezloco/linux-command-centre/releases/latest).

```bash
# Debian/Ubuntu
sudo dpkg -i linux-command-centre_*.deb

# Fedora/RHEL
sudo rpm -i linux-command-centre-*.rpm
```

**Package repositories** (AUR, Fedora COPR, openSUSE OBS, and a self-hosted APT repo are packaged and ready to publish — see `packaging/README.md` for status and setup). Once live, these will keep the app up to date automatically rather than requiring manual `.deb`/`.rpm` downloads per release.

**From source** — see [Development](#development) below.

## Modules

### Overview

| Module | What it does |
|---|---|
| **System** | CPU, memory, uptime, OS/kernel info, AI-assisted diagnostics (optional `CLAUDE_API_KEY`) |
| **Processes** | Live process list with search, sort, kill |

### Network

| Module | What it does |
|---|---|
| **Network** | Interface status, IP addresses, live up/down speed |
| **VPN** | NetworkManager VPN connections — connect/disconnect, create OpenVPN (import `.ovpn` or manual) and WireGuard (key generation, peer config) |
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
| **Security** | Firewall status, disk encryption, secure boot, AppArmor, failed logins, automatic security updates, ClamAV home-directory scan with directory excludes, Lynis hardening audit, residual package purge, unused protocol blocking — scan/audit results persist across restarts |
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
│   ├── index.ts          # Electron main process, window creation, navigation guards
│   ├── ipc.ts            # All IPC handlers (~4200 lines)
│   ├── privilege.ts      # pkexec bridge → lcc-helper (wrapper-aware)
│   ├── shell.ts          # sysfs read/write helpers
│   ├── stream-server.ts  # WebSocket server (localhost:52341, origin-restricted)
│   ├── env.ts            # .env.local loader (project root in dev, userData when packaged)
│   ├── claude.ts         # AI diagnostics (CLAUDE_API_KEY)
│   └── hardware-profiles.ts # Hardware compatibility checks
├── preload/
│   └── index.ts          # context bridge — IPC channel allowlist enforced here
├── shared/
│   ├── ipc-channels.ts   # Every IPC channel — preload allowlist + dev drift check
│   └── electron-api.ts   # window.electronAPI type shared by preload and renderer
└── renderer/
    └── src/
        ├── App.svelte     # Sidebar nav + panel switcher
        ├── lib/
        │   ├── utils.ts         # invoke() wrapper
        │   └── CommandPalette.svelte  # Ctrl+K quick-nav
        └── modules/       # One Svelte component per feature panel (41 total)
helper/
├── lcc-helper            # Wrapper the polkit action is bound to (installed to /usr/lib/linux-command-centre/)
├── lcc-helper.js         # Privileged helper — whitelisted ops, runs as root via pkexec
├── io.lcc.helper.policy  # Polkit action bound to the wrapper path (not /usr/bin/node)
├── after-install.sh      # deb/rpm postinst — installs helper, wrapper, policy
└── after-remove.sh       # deb/rpm postrm — removes them
```

### Privileged operations

Actions requiring root write access run through `helper/lcc-helper.js` via `pkexec`, which triggers the native GNOME Polkit authentication dialog.

The `io.lcc.helper.run` polkit action is bound to the exact path of a dedicated wrapper — `/usr/lib/linux-command-centre/lcc-helper` (installed root-owned by the deb/rpm postinst or snap hooks) — **not** to the `node` binary. An unrelated `pkexec node <script>` therefore falls through to the generic `org.freedesktop.policykit.exec` action with one-shot admin auth; it can neither inherit the LCC action's `auth_admin_keep` window nor trigger LCC's branded prompt. In development and AppImage/tar.gz installs (no postinst), the app falls back to `pkexec node <helper>` under that generic action.

The helper accepts only a strict whitelist of operations, re-validates every argument, and receives secrets (VPN credentials, private keys, file contents) as JSON over **stdin** rather than argv — pkexec logs full command lines to the system journal:

| Operation | What it does |
|---|---|
| `set-battery-threshold` | Write `charge_control_end_threshold` (50–100%) |
| `set-brightness` | Write to `/sys/class/backlight/*/brightness` |
| `wifi-toggle` | `rfkill block/unblock wifi` |
| `bluetooth-toggle` | `rfkill block/unblock bluetooth` |
| `touchpad-rebind` | Unbind/rebind `i2c-GXTP7863:00` via i2c_hid_acpi |
| `camera-rebuild` / `camera-load` | Rebuild/load camera kernel modules |
| `rtc-set-utc` | `timedatectl set-local-rtc` |
| `set-sleep-state` | Write `s2idle` or `deep` to `/sys/power/mem_sleep` |
| `set-power-profile` | Write ACPI `platform_profile` |
| `grub-set` | Update `/etc/default/grub` and run `update-grub` |
| `service-action` | `systemctl start/stop/enable/disable/restart` (`.service` and `.timer`) |
| `set-timezone` | `timedatectl set-timezone` |
| `set-ntp` | `timedatectl set-ntp` |
| `vpn-up` / `vpn-down` | `nmcli connection up/down` |
| `vpn-create-openvpn` | Create OpenVPN profile — credentials via stdin, `.ovpn` imports staged in a private `/run` dir |
| `vpn-create-wireguard` / `vpn-create-wireguard-full` | WireGuard profiles — private key via stdin, written as a NetworkManager keyfile (never on argv) |
| `logs-query` | `journalctl` with a whitelisted flag set only |
| `firewall-action` | `ufw enable/disable` |
| `firewall-status` | `ufw status numbered` |
| `firewall-rule-add` | `ufw allow/deny/reject <port>/<proto>` |
| `firewall-delete-rule` | `ufw --force delete <num>` |
| `kill-process` | `kill -TERM/-KILL <pid>` |
| `apt-upgrade` / `apt-upgrade-all` | `apt-get install --only-upgrade` / `apt-get upgrade` |
| `tool-install` | Install optional tools (clamav, lynis, …) |
| `set-auto-upgrades` | Configure unattended-upgrades for security updates |
| `lynis-audit` | Run `lynis audit system` |
| `purge-residual-packages` | `apt-get purge` residual-config packages |
| `blacklist-unused-protocols` | Block dccp/sctp/rds/tipc kernel modules from loading |
| `user-add` | `useradd -m` |
| `user-delete` | `userdel -r` — normal accounts only (UID ≥ 1000), never the invoking user |
| `user-toggle-sudo` | `usermod -aG sudo` / `gpasswd -d sudo` — same account restrictions |
| `dmidecode-memory` | `dmidecode -t memory` for RAM module details |
| `set-sysctl` | Write whitelisted sysctl keys |
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

Connections are Origin-checked (Electron `file://` and the dev server only — random browser pages can't connect), per-socket subscriptions are capped, and `unsubscribe` is honoured.

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
| `clamscan` / `freshclam` | Antivirus scan and definitions (ClamAV — optional, installable from the Security panel) |
| `lynis` | Hardening audit (optional, installable from the Security panel) |
| `wg` | WireGuard key generation |
| `df` / `lsblk` / `fdisk` | Storage and mounts |
| `useradd` / `userdel` / `usermod` / `gpasswd` | User management |
| `update-grub` | GRUB boot manager |

## Development

```bash
npm install
npx install-electron  # Electron 44+ does not auto-download its binary on install
npm run dev           # Electron + Vite dev server with hot reload
npm run check         # Typecheck renderer (svelte-check) + main/preload (tsc)
npm run build         # Compile TypeScript + bundle renderer
npm run package       # Build and package as .deb and AppImage
```

Packaged artifacts go to `release/`. Distribution targets: `.deb`, `.rpm`, `.AppImage`, `.tar.gz` (Linux only). A `.snap` is also built via `snapcraft`.

### AI diagnostics (optional)

The System panel can run AI-assisted diagnostics. Set `CLAUDE_API_KEY` in `.env.local` — loaded from the project root in development, or from the app's userData directory (`~/.config/linux-command-centre/.env.local`) in packaged builds. The file is gitignored and never packaged.

### The privileged helper

Privileged operations run through `helper/lcc-helper.js` executed as root via `pkexec`, behind the `io.lcc.helper.run` polkit action. That action is bound to a dedicated wrapper executable — `/usr/lib/linux-command-centre/lcc-helper` — rather than to `node`, so only the fixed, root-owned helper is authorized by it.

In **development** no wrapper is installed, so `pkexec` runs `node <repo>/helper/lcc-helper.js` under the generic `org.freedesktop.policykit.exec` action — same password prompt, generic text. Nothing to install manually.

In **packaged builds** (`deb`/`rpm`), `helper/after-install.sh` installs the wrapper, helper, and policy at fixed root-owned paths; `helper/after-remove.sh` removes them. The snap's `install`/`post-refresh`/`remove` hooks do the same. AppImage/tar.gz have no postinst, so they use the same generic-action fallback as development.

## Snap packaging

`snap/snapcraft.yaml` builds a **classic-confinement** snap. Classic confinement is required because the app performs system-level operations (editing `/etc/default/grub`, loading kernel modules, managing users, running `apt-get`, managing UFW, etc.) that have no equivalent snapd strict-confinement interfaces.

Build locally:

```bash
snapcraft --use-lxd
# or, if LXD is not available and you accept host modifications:
sudo snapcraft --destructive-mode
```

The resulting `.snap` is produced in the project root.

### Snap Store publishing status

**On hold.** The [classic confinement request](https://forum.snapcraft.io/t/classic-confinement-request-for-linux-command-centre/53163) was declined — Canonical's reviewers reserve classic confinement for established projects with a track record, and root-helper-via-`pkexec` is explicitly excluded from classic confinement regardless of project maturity. Revisiting this needs either a strict-confinement rework (replacing the `pkexec` root helper with snapd's `polkit` interface for the operations that support it) or a larger, more established user base before re-requesting — see `packaging/README.md` for the channels being used instead in the meantime.

## GitHub releases and publishing

Pushing a tag matching `v*` triggers the `Release` workflow:

1. Builds `.deb`, `.rpm`, `.tar.gz`, and `.snap` artifacts.
2. Creates a **draft** GitHub Release and attaches all artifacts.

After the draft release is published, the `Publish Snap` workflow can be run manually to upload the `.snap` to the Snap Store. It requires a repository secret named `SNAPCRAFT_STORE_CREDENTIALS`. Generate it with:

```bash
snapcraft export-login --snaps=linux-command-centre --channels=stable exported.txt
```

Then paste the contents of `exported.txt` into the GitHub secret.

## Tech stack

- [Electron](https://www.electronjs.org/) 44
- [Svelte](https://svelte.dev/) 5 (runes mode)
- [electron-vite](https://electron-vite.org/) for build tooling
- [Tailwind CSS](https://tailwindcss.com/) 3
- [lucide-svelte](https://lucide.dev/) for icons
- [ws](https://github.com/websockets/ws) for the local WebSocket stream server
