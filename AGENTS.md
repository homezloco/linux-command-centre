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
- Package scripts: `helper/after-install.sh` / `helper/after-remove.sh` install/remove the wrapper, helper, and policy (wired via the `deb`/`rpm` target sections in `package.json` — electron-builder 26 does not accept these under `linux`)
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
| `src/main/ipc.ts` | Electron IPC handlers (~4200 lines) |
| `src/main/privilege.ts` | `pkexec` bridge to the root helper |
| `src/shared/ipc-channels.ts` | Allowlist of every IPC channel — enforced by the preload and drift-checked against `ipcMain.handle` calls in dev |
| `src/shared/electron-api.ts` | Type of `window.electronAPI` (preload bridge), declared on `Window` for the renderer |
| `helper/lcc-helper.js` | Whitelisted privileged operations |
| `helper/lcc-helper` | Wrapper executable the polkit action binds to |

## Secrets / environment

- `.env.local` is gitignored and excluded from packages. In dev it is loaded from the project root; in packaged builds it is loaded from `app.getPath('userData')` so `CLAUDE_API_KEY` can still be supplied for the AI diagnostics panel.

## Security panel notes

- ClamAV scan/audit state is in-memory in the main process, but completed results persist to `userData/security-history.json` and are rehydrated on startup — the panel shows them via the `security:*-status` channels.
- Scan excludes are directory-name fragments (`--exclude-dir`); a trailing `*` means prefix match (`cuttlefish*`). Default-on options include node_modules, .cache, Android SDK/emulator images, tool caches, and dreamos.

## Logging & observability

- `src/main/log.ts` — JSON-lines app log at `userData/logs/lcc.log` (2MB rotation, keeps `.1`) plus `classifyError()` errClass taxonomy (`lock-busy`/`auth-cancelled`/`timeout`/`spawn`/`exit-N`) and the operations journal at `userData/logs/operations.jsonl` (~800 entries). `writeLog` also prints to console in dev.
- Every privileged op is journaled inside `privilegedOp`/`privilegedOpStreaming`/`privilegedOpWithStdin` (`src/main/privilege.ts`) with duration + errClass — read back via the `ops:history` channel; the Logs panel's **Activity** tab renders it.
- Renderer errors: `invoke()` reports failures and `installErrorCapture()` (App.svelte) forwards `onerror`/`unhandledrejection` — both land via the rate-limited `app:log` channel.
- `logs:diagnostics` builds the paste-ready support bundle (versions + ops journal + log tail + journalctl grep) behind the Logs panel "Copy diagnostics" button.
- apt lock note: `DPkg::Lock::Timeout` does **not** cover `apt-get update`'s lists lock (`/var/lib/apt/lists/lock`) — verified on apt 2.8.3. The helper's `runAptUpdate()` retries through it for 600s; install/dist-upgrade steps rely on the option itself.
- The installed helper (`/usr/lib/linux-command-centre/lcc-helper.js`) only refreshes on package reinstall — dev runs still execute the installed copy when present (`helperCommand()` prefers it), so helper edits need `sudo cp helper/lcc-helper.js /usr/lib/linux-command-centre/lcc-helper.js` to take effect locally.

## RootWatch integration

- `src/main/rootwatch.ts` — client for a RootWatch instance (`rootwatch.dev`): cli-auth browser pairing (`POST /api/v1/cli-auth/start|claim`) → `rw_…` token sealed via `safeStorage` into `userData/rootwatch.json`; status pulled read-scope (`/score`, `/devices`, `/remediations`).
- Device enrollment (`/api/v1/enroll/start|claim`) stores a separate write-scope `deviceTokenEnc`; a 5-min reporter POSTs `/api/v1/devices/report` with metrics/updates/lcc ops+scan summary. hostId = `sha256("rootwatch-host:" + /etc/machine-id)` — must match the RW desktop agent so both report to one device row. Commands are acked `unsupported` except `refresh` → immediate re-report.
- Remediation bridge: `rwRunLocal` maps RW plan argv onto whitelisted helper ops (systemctl→`service-action`, ufw→`firewall-*`, apt→`apt-install`/`apt-purge`/`apt-upgrade-all`) and refuses upfront on unmappable steps; `rwRemediateRemote` needs an admin-scope token.
- Panel: `src/renderer/src/modules/rootwatch/RootWatchPanel.svelte` (Settings nav).

## Snap Store notes

- Confinement is `classic` because the app performs system-level writes that have no snapd interface (GRUB, kernel modules, users, apt upgrades, UFW, `/etc/hosts`, `/etc/resolv.conf`, etc.).
- The classic-confinement request was **declined** (see https://forum.snapcraft.io/t/classic-confinement-request-for-linux-command-centre/53163 and `packaging/README.md`) — Canonical excludes root-helper-via-pkexec from classic confinement. Re-requesting would need a strict-confinement rework or a more established project.
- Do **not** run the `Publish Snap` workflow.
- Publishing to the Snap Store requires a GitHub secret `SNAPCRAFT_STORE_CREDENTIALS`, generated via `snapcraft export-login`.

## Local build tip

The snap uses `build-snaps: node/20/stable`. If building with `snapcraft --use-lxd` is not possible, use `sudo snapcraft --destructive-mode` on a machine with Node available; otherwise the build will fail when snapcraft tries to install the Node snap in unprivileged destructive mode.
