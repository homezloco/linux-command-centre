# PLAN.md

The Linux Command Centre improvement plan.

## Now (hours)
- [ ] **Tokens** — Foundational design token system (color, spacing, typography primitives) — *in flight via PR #7, branch `lcc/loop-2026-10-04-tokens-design-system`*
- [ ] **Primitives** — Build atomic UI components based on tokens (Button, Card, Input, Select, Toast, etc.)
- [ ] **Shell** — Main application container and navigation layout (sidebar, header, module registry)
- [ ] **Home** — Dashboard home view with system overview widgets
- [ ] **Layout Contract** — Standardize component sizing and responsiveness (breakpoints, container queries)
- [ ] **Chrome A11y** — Ensure accessibility standards for the browser-based shell (ARIA, focus management, contrast)

## Next (days)
- [ ] Native packaging: publish `v0.1.0` release (un-draft) so AUR/COPR/OBS/APT manifests can build
- [ ] Update packaging checksums for new release via `packaging/scripts/update-checksums.sh`
- [ ] Flathub manifest: fix `sha256` placeholder and source URL mismatch (`linux-command-centre-0.1.0-linux-amd64.tar.gz` → `linux-command-centre-v0.1.0-linux-x64.tar.gz`)
- [ ] Security panel: persist ClamAV scan state to `userData/security-history.json` (rehydration works, verify persistence)
- [ ] Helper whitelist audit: ensure each privileged op validates its own arguments (CONTRIBUTING.md convention)

## Orientation sources (per loop.md)
- `docs/ux-ui-overhaul.md` → canonical design/backlog, PR sequence
- `packaging/README.md` → native packaging status (AUR/COPR/OBS/APT)
- `AGENTS.md` → verified commands, privilege model, Snap Store status
- `CONTRIBUTING.md` → module conventions, PR scoping
- `docs/loop-reports/` → prior rounds' honest leftovers
- GitHub issues on homezloco/linux-command-centre
