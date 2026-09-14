# Project Notes for Agents

## Linux Command Centre

A desktop system-management dashboard built with **Electron 44 + Svelte 5 + TypeScript**, packaged with **electron-builder** and **snapcraft**.

## Common commands

```bash
# Install dependencies
npm install
# Electron 44+ does not auto-download the binary on install — run once after install:
npx install-electron

# Dev server with hot reload
npm run dev

# Typecheck renderer (svelte-check) and main/preload (tsc)
npm run check

# Compile TypeScript and bundle renderer
npm run build

# Build and package as .deb / .AppImage
npm run package

# Build snap locally
snapcraft --use-lxd
# or, if LXD is unavailable:
sudo snapcraft --destructive-mode
```

## Build outputs

- Electron bundles: `release/`
- Snap package: project root `linux-command-centre_0.1.0_amd64.snap`
- Snapcraft working dirs: `parts/`, `prime/`, `stage/`, `.craft/` (ignored)

## Privilege model

Privileged operations are gated through a whitelisted helper:

- Source: `helper/lcc-helper.js`
- Wrapper script: `helper/lcc-helper` (installed root-owned at `/usr/lib/linux-command-centre/lcc-helper`)
- Polkit policy: `helper/io.lcc.helper.policy` — bound to the wrapper path via `org.freedesktop.policykit.exec.path`, **not** to `/usr/bin/node`, so `pkexec node <other-script>` never matches the app's action
- Bridge in main process: `src/main/privilege.ts` — prefers the installed wrapper; falls back to `pkexec node <helper-script>` in dev / AppImage / tar.gz (generic pkexec prompt, no custom action)
- Package scripts: `helper/after-install.sh` / `helper/after-remove.sh` install/remove the wrapper, helper, and policy (wired via `linux.afterInstall`/`afterRemove` in `package.json`)
- Helper is bundled at `resources/helper/lcc-helper.js` in packaged builds
- Policy is installed to `usr/share/polkit-1/actions/io.lcc.helper.policy` in the snap; the snap `install`/`post-refresh` hooks also install the wrapper, and `remove` cleans all three
- Sensitive inputs (OpenVPN credentials/config, WireGuard private key, `/etc/hosts` content, etc.) are passed to the helper as JSON over **stdin** via `privilegedOpWithStdin`, never on the `pkexec` argv (argv is journal-logged and `/proc`-visible)

## Key files

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts, electron-builder config |
| `snap/snapcraft.yaml` | Snap package definition (classic confinement) |
| `.github/workflows/release.yml` | Builds `.deb`, `.rpm`, `.tar.gz`, `.snap` and drafts a GitHub Release |
| `.github/workflows/snap-publish.yml` | Manually publishes the built `.snap` to the Snap Store |
| `src/main/ipc.ts` | Electron IPC handlers (~4100 lines) |
| `src/main/privilege.ts` | `pkexec` bridge to the root helper |
| `src/shared/ipc-channels.ts` | Allowlist of every IPC channel — enforced by the preload and drift-checked against `ipcMain.handle` calls in dev |
| `src/shared/electron-api.ts` | Type of `window.electronAPI` (preload bridge), declared on `Window` for the renderer |
| `helper/lcc-helper.js` | Whitelisted privileged operations |
| `helper/lcc-helper` | Wrapper executable the polkit action binds to |

## Secrets / environment

- `.env.local` is gitignored and excluded from packages. In dev it is loaded from the project root; in packaged builds it is loaded from `app.getPath('userData')` so `CLAUDE_API_KEY` can still be supplied for the AI diagnostics panel.

## Snap Store notes

- Confinement is `classic` because the app performs system-level writes that have no snapd interface (GRUB, kernel modules, users, apt upgrades, UFW, `/etc/hosts`, `/etc/resolv.conf`, etc.).
- A classic-confinement request is tracked at https://forum.snapcraft.io/t/classic-confinement-request-for-linux-command-centre/53163.
- Do **not** run the `Publish Snap` workflow until that request is approved.
- Publishing to the Snap Store requires a GitHub secret `SNAPCRAFT_STORE_CREDENTIALS`, generated via `snapcraft export-login`.

## Local build tip

The snap uses `build-snaps: node/20/stable`. If building with `snapcraft --use-lxd` is not possible, use `sudo snapcraft --destructive-mode` on a machine with Node available; otherwise the build will fail when snapcraft tries to install the Node snap in unprivileged destructive mode.
