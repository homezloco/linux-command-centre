# The improvement loop

How Linux Command Centre improves itself. Each round takes the
next-highest-leverage increment, ships it verified and documented, and
feeds what it learned back into the next round. This file is the loop's
durable state: the invariants, the verification contract, and the ranking
heuristics. When a round teaches something the checklist missed, add it
here.

## The loop

1. **Orient** — Read the "what remains" sources below and the latest
   report under `docs/loop-reports/` for candidates. If the operator
   named a specific item, that item wins.
2. **Choose** — Pick ONE increment, or one tight batch of related items,
   by the ranking heuristics below. If the choice is a genuine design
   fork (contradicts `docs/ux-ui-overhaul.md`'s PR ordering, the
   privilege model, or a two-defensible-shapes call), present the options
   and wait — don't guess past it.
3. **Check the blast radius first** — Before writing code, state what the
   change touches: does it add an IPC channel (must be allowlisted in
   `src/shared/ipc-channels.ts` — the preload enforces it and dev-mode
   drift-checks it), does it touch `helper/lcc-helper.js` (the entire
   security model rests on that whitelist staying tight), does it pass
   secrets through `pkexec` argv instead of stdin, does it assume a
   specific distro/desktop (Ubuntu + GNOME is the target, but degrade
   honestly), and does it make any web-deploy assumption? There is none —
   this is a desktop app.
4. **Implement** — The smallest diff that satisfies the invariants. One
   module/fix per change, per `CONTRIBUTING.md`. New privileged
   operations go in the helper whitelist as narrowly-scoped entries that
   validate their own arguments — never broaden an existing entry. New
   panels follow the shape of a nearby existing module (`modules/dns/`
   for read/write settings, `modules/thermal/` for live streaming).
5. **Verify** — The contract below, every time. There is no unit-test
   suite; `npm run check` + `npm run build` are the gate.
6. **Document in the same commit** — `README.md` module tables and
   `AGENTS.md` get updated when modules, channels, helper ops, or
   packaging change. Docs are part of the feature.
7. **Ship and report honestly** — One commit per feature, push on an
   `lcc/loop-*` branch, then report in
   `docs/loop-reports/<date>-<slug>.md`: what shipped, what was verified
   and how, and what's genuinely left — separated into real gaps, design
   forks, and diminishing returns. Never report "done" without the check
   output that proves it. Nothing in CI launches Electron or touches a
   real system — runtime behavior of privileged ops is always an untested
   assumption and must be reported as such.

## Invariants — never trade these away

- **The privilege boundary is the product.** `helper/lcc-helper.js` runs
  as root via `pkexec`; its whitelist stays strict, every argument is
  re-validated, and secrets (VPN credentials, WireGuard keys, `/etc/hosts`
  content) only ever arrive as JSON over **stdin** — `pkexec` argv is
  journal-logged and `/proc`-visible. The polkit action stays bound to
  the installed wrapper path, never to `/usr/bin/node`.
- **The preload allowlist is enforced.** Every IPC channel is declared in
  `src/shared/ipc-channels.ts` and enforced by the preload. No new
  channel without an allowlist entry; no `ipcRenderer` passthrough.
- **Desktop app, Linux-native.** No web-deploy, no browser-support, no
  hosted-backend assumptions. System interactions go through the real
  tools (`systemctl`, `nmcli`, `ufw`, `gsettings`, sysfs) with honest
  degradation when a tool or distro feature is absent.
- **Destruction needs confirmation.** Operations that mutate the system
  (kill process, delete user, GRUB write, firewall change) keep their
  confirm/toast treatment; a round may tighten them, never strip them.
- **Secrets stay out of bundles and logs.** `CLAUDE_API_KEY` loads from
  `.env.local`/`userData` and is never committed, packaged, or logged.

## Verification contract

```bash
npm ci
npm run check    # svelte-check (renderer) + tsc --noEmit (main/preload)
npm run build    # electron-vite build
```

- **No test suite exists** — do not invent commands. When a change is
  worth testing, report it as a gap instead of claiming coverage.
- **Not in CI (documented exclusions):** `npm run dev` and any real
  Electron launch need a display + the Electron binary
  (`npx install-electron`); `npm run package` (electron-builder) and
  `snapcraft` are heavy packaging steps covered by `release.yml` on
  version tags; privileged helper ops need `pkexec`, polkit, and a real
  Linux system. Changes affecting any of these must say so in the report.
- `npm run check` covers both renderer (`tsconfig.web.json` via
  svelte-check) and main/preload (`tsconfig.node.json` via tsc) — a
  change is not verified if it only typechecks one side.
- Re-read any large edit's seams — verify in the file, not the tool
  output. `src/main/ipc.ts` is ~4200 lines; grep for the handler you're
  near before assuming conventions.

## Ranking heuristics — what "next" means

1. **`docs/ux-ui-overhaul.md` PR sequence** — the repo's own staged plan
   (tokens → primitives → shell → Home → layout contract → chrome a11y →
   panel clusters) outranks ad-hoc polish; take the next unshipped stage,
   not a later one.
2. **Privilege-model correctness** — helper whitelist gaps, argv leaks,
   IPC channels missing from the allowlist or drift-check.
3. **Module correctness** — handlers that fail on real systems, missing
   degradation paths, wrong tool assumptions for the target distro.
4. **UX consistency per the overhaul doc** — confirms, toasts, status
   tokens (`--status-*` instead of hardcoded `text-green-400`), one
   save-model rule.
5. **Hygiene** — dead code, unused deps (e.g. `bits-ui`/`cn()` until the
   overhaul lands them), packaging metadata drift.

## What remains — orientation sources

- `docs/ux-ui-overhaul.md` → the canonical design/backlog doc, including
  the panel migration matrix and required PR ordering.
- `AGENTS.md` → verified commands, privilege model, Snap Store status
  (classic confinement was declined; do **not** run `Publish Snap`).
- `CONTRIBUTING.md` → module-adding conventions and PR scoping rules.
- `packaging/README.md` → distribution-channel status (APT repo, AUR,
  COPR, OBS) — real pending publishing work lives there.
- `docs/loop-reports/` → prior rounds' honest leftovers.
- GitHub issues on `homezloco/linux-command-centre` → operator-filed work.

## The loop, hosted

This loop runs on the LiveGraph deployment: the "LCC Engineering" graph
ticks on a schedule, implements one increment via GitHub MCP on an
`lcc/loop-*` branch, CI on the branch (`.github/workflows/ci.yml`,
triggered on `lcc/**` pushes) is the verifier, and an approved verdict
routes to the gated "LCC Publisher" graph — the PR parks in `/approvals`
until a human ships it. The repo is the loop's memory: reports live in
`docs/loop-reports/` on each branch.

Honest limits: the engineer cannot run commands — npm verification
happens in CI, not in the hop — and CI never launches Electron, installs
the polkit policy, or touches a real system. The smallest-diff rule
matters more here, not less.
