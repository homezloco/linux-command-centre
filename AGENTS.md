# Project Notes for Agents

## Linux Command Centre

A desktop system-management dashboard built with **Electron 33 + Svelte 5 + TypeScript**, packaged with **electron-builder** and **snapcraft**.

## Common commands

```bash
# Install dependencies
npm install

# Dev server with hot reload
npm run dev

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
- Polkit policy: `helper/io.lcc.helper.policy`
- Bridge in main process: `src/main/privilege.ts`
- Helper is bundled at `resources/helper/lcc-helper.js` in packaged builds
- Policy is installed to `usr/share/polkit-1/actions/io.lcc.helper.policy` in the snap

## Key files

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts, electron-builder config |
| `snap/snapcraft.yaml` | Snap package definition (classic confinement) |
| `.github/workflows/release.yml` | Builds `.deb`, `.rpm`, `.tar.gz`, `.snap` and drafts a GitHub Release |
| `.github/workflows/snap-publish.yml` | Manually publishes the built `.snap` to the Snap Store |
| `src/main/ipc.ts` | Electron IPC handlers (~2800 lines) |
| `src/main/privilege.ts` | `pkexec` bridge to the root helper |
| `helper/lcc-helper.js` | Whitelisted privileged operations |

## Snap Store notes

- Confinement is `classic` because the app performs system-level writes that have no snapd interface (GRUB, kernel modules, users, apt upgrades, UFW, `/etc/hosts`, `/etc/resolv.conf`, etc.).
- A classic-confinement request is tracked at https://forum.snapcraft.io/t/classic-confinement-request-for-linux-command-centre/53163.
- Do **not** run the `Publish Snap` workflow until that request is approved.
- Publishing to the Snap Store requires a GitHub secret `SNAPCRAFT_STORE_CREDENTIALS`, generated via `snapcraft export-login`.

## Local build tip

The snap uses `build-snaps: node/20/stable`. If building with `snapcraft --use-lxd` is not possible, use `sudo snapcraft --destructive-mode` on a machine with Node available; otherwise the build will fail when snapcraft tries to install the Node snap in unprivileged destructive mode.
