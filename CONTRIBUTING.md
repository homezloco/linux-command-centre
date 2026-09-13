# Contributing

Linux Command Centre is a young project — practical contributions of any size are welcome, and issues are as valuable as code.

## Reporting bugs / requesting features

Open an issue with the relevant template. For bugs, include:
- Your distro and desktop environment (`echo $XDG_CURRENT_DESKTOP`)
- The exact module/action that failed
- Relevant output from `journalctl --user -b | grep linux-command-centre` if the app crashed

## Development setup

```bash
npm install
npm run dev        # Electron + Vite dev server with hot reload
```

Privileged operations (anything touching `helper/lcc-helper.js`) need the polkit policy installed locally first — see the "Installing the privileged helper" section in the README.

## Adding a module

Each feature panel is a self-contained Svelte component under `src/renderer/src/modules/`, backed by IPC handlers in `src/main/ipc.ts`. Look at an existing module close to what you're building (e.g. `modules/dns/` for a read/write settings panel, `modules/thermal/` for a live-streaming one) and follow its shape — handler naming, error handling, and the `invoke()` wrapper pattern are consistent across modules.

If your change needs root (writing outside `$HOME`, touching system config), add a narrowly-scoped operation to `helper/lcc-helper.js`'s whitelist rather than broadening an existing one — the whole security model rests on that whitelist staying tight and each entry validating its own arguments.

## Pull requests

- Keep PRs scoped to one module/fix — easier to review, easier to revert if something's wrong.
- Run `npm run build` before opening a PR; it catches TypeScript errors the dev server tolerates.
- Describe *why* the change is needed, not just what it does.

## Packaging

If you're adding or fixing a distribution channel, see `packaging/README.md` — it covers the AUR/COPR/OBS/APT setup and the shared "why" behind the approach (repackaging built artifacts rather than building from source in each sandboxed builder).
