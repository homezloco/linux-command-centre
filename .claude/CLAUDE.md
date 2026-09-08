# Linux Command Centre — Project Context

## What this is

A desktop system-management dashboard for Ubuntu/Linux, built with **Electron 33 + Svelte 5 + TypeScript**. It exposes network, hardware, storage, services, logs, users, updates, firewall, GRUB, locale, timezone, VPN, Bluetooth, Wi-Fi, power settings, and camera controls in one UI.

## Important architectural details

- Privileged operations are intentionally funnelled through one whitelisted helper: `helper/lcc-helper.js`.
- The helper runs as root via `pkexec` using `helper/io.lcc.helper.policy`.
- The main process bridge is `src/main/privilege.ts`.
- In packaged builds the helper lives at `resources/helper/lcc-helper.js`.

## Common commands

```bash
npm install      # install dependencies
npm run dev      # dev server with hot reload
npm run build    # compile TypeScript + bundle renderer
npm run package  # build .deb and .AppImage
```

## Snap packaging

- Defined in `snap/snapcraft.yaml`.
- Uses `confinement: classic` because many operations (GRUB edits, kernel modules, user management, apt upgrades, UFW, `/etc/hosts`, `/etc/resolv.conf`, etc.) have no snapd strict interface.
- Build locally with `snapcraft --use-lxd` or `sudo snapcraft --destructive-mode`.
- A classic-confinement request is pending at https://forum.snapcraft.io/t/classic-confinement-request-for-linux-command-centre/53163.

## Release / publishing

- Tag push (`v*`) triggers `.github/workflows/release.yml`, which builds `.deb`, `.rpm`, `.tar.gz`, `.snap`, and drafts a GitHub Release.
- `.github/workflows/snap-publish.yml` is a manual workflow that uploads the built `.snap` to the Snap Store. **Do not run it until the classic-confinement request is approved.**
- Snap Store publishing requires a GitHub secret `SNAPCRAFT_STORE_CREDENTIALS` from `snapcraft export-login`.

## Key files

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts, electron-builder config |
| `snap/snapcraft.yaml` | Snap package definition |
| `.github/workflows/release.yml` | GitHub Release build pipeline |
| `.github/workflows/snap-publish.yml` | Manual Snap Store upload |
| `src/main/ipc.ts` | ~2800 lines of IPC handlers |
| `src/main/privilege.ts` | `pkexec` bridge |
| `helper/lcc-helper.js` | Whitelisted privileged operations |

For full agent notes see `AGENTS.md` in the repo root.
