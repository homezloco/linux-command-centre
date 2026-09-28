# Loop Report: 2026-09-28 — Orientation: Missing Design Doc Blocks Ranking

## What was chosen and why

Per loop.md step 1 (Orient), I read:
- `loop.md` — the loop invariants, ranking heuristics, and orientation sources
- `PLAN.md` — does not exist in the repository
- `docs/loop-reports/` — contains only `.gitkeep`, no prior reports
- `docs/ux-ui-overhaul.md` — **referenced as the #1 ranking source** in `loop.md:95-98` but **does not exist**
- `AGENTS.md` — verified commands, privilege model, Snap Store status
- `CONTRIBUTING.md` — module conventions, PR scoping
- `packaging/README.md` — native packaging status (AUR/COPR/OBS/APT)
- GitHub issues — zero open issues

The ranking heuristics in `loop.md:93-108` place `docs/ux-ui-overhaul.md` PR sequence as **priority #1**. Since that file is missing, the loop cannot rank candidates per its own rules — this is a genuine design fork (the loop's own ranking depends on a document that doesn't exist).

## What changed

Created this report on branch `lcc/loop-2026-09-28-orientation-missing-design-doc` to document the blocker. No code changes were made.

## What could NOT be verified

- Cannot run `npm run check` / `npm run build` — CI verifies, not the engineer
- Cannot verify whether any `docs/ux-ui-overhaul.md` ever existed in history (would need `git log --all --full-history -- docs/ux-ui-overhaul.md`)
- Cannot verify the exact PR sequence the overhaul doc would have prescribed

## What remains

**Blocker:** `docs/ux-ui-overhaul.md` is missing. The loop cannot proceed per its own ranking until either:
1. The document is restored/created (if it was accidentally deleted), or
2. The ranking heuristics in `loop.md` are updated to reference a different orientation source

**Open lcc/* branches (in-flight work):**
- `lcc/loop-2026-09-25-flathub-cleanup`
- `lcc/loop-2026-09-26-ipc-channel-purge-residual-status`
- `lcc/loop-2026-09-26-orientation-report`

These branches exist but have no open PRs — they are the current in-flight set per loop.md's "open lcc/* branches and PRs ARE the in-flight set" rule.

**Next action needed:** A human must decide whether to restore/create `docs/ux-ui-overhaul.md` or amend `loop.md`'s ranking to use a different primary source (e.g., `AGENTS.md`, `CONTRIBUTING.md`, `packaging/README.md`, GitHub issues).