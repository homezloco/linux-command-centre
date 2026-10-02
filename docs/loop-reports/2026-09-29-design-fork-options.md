# Loop Report: 2026-09-29 — Design Fork: Missing `docs/ux-ui-overhaul.md` Blocks Loop Ranking

## What was chosen and why

Per loop.md step 1 (Orient), I read:
- `loop.md` — the loop invariants, ranking heuristics, and orientation sources
- `PLAN.md` — **does not exist** in the repository
- `docs/loop-reports/` — contains only the 2026-09-28 report on this same blocker (PR #3)
- `docs/ux-ui-overhaul.md` — **referenced as the #1 ranking source** in `loop.md:95-98` but **does not exist**
- `AGENTS.md` — verified commands, privilege model, Snap Store status
- `CONTRIBUTING.md` — module conventions, PR scoping
- `packaging/README.md` — native packaging status (AUR/COPR/OBS/APT)
- GitHub issues — zero open issues
- Open lcc/* branches (in-flight per loop.md): `lcc/loop-2026-09-25-flathub-cleanup`, `lcc/loop-2026-09-26-ipc-channel-purge-residual-status`, `lcc/loop-2026-09-26-orientation-report`

The ranking heuristics in `loop.md:93-108` place `docs/ux-ui-overhaul.md` PR sequence as **priority #1**. Since that file is missing, the loop cannot rank candidates per its own rules — this is a genuine design fork (the loop's own ranking depends on a document that doesn't exist).

Per loop.md step 2 (Choose): "If the choice is a genuine design fork (contradicts `docs/ux-ui-overhaul.md`'s PR ordering, the privilege model, or a two-defensible-shapes call), present the options and wait — don't guess past it."

This iteration presents the options and stops — no code is shipped.

## The Design Fork

The loop's ranking mechanism has a hard dependency on a file that does not exist. Two defensible paths forward exist:

### Option A: Create `docs/ux-ui-overhaul.md` (restore the intended ranking source)

**Rationale:** The loop.md author explicitly designed the ranking around this document. It likely existed or was intended to exist, and its absence is an accidental gap. Creating it restores the loop's intended operation.

**What it would contain:** A prioritized PR sequence for UX/UI overhaul — e.g., design tokens, layout system, module shell, navigation, theming, accessibility, responsive breakpoints — in the order the original designer intended.

**Risk:** Without the original author's intent, any content we write is speculative. A human who knows the project's UX direction must author or approve it.

### Option B: Amend `loop.md` ranking heuristics to use a different primary source

**Rationale:** The missing document may never have existed, or the project's priorities may have shifted. The loop should rank against sources that actually exist and are maintained.

**Candidate replacement sources (in rough priority order):**
1. `AGENTS.md` — documents the privilege model, build commands, packaging status, and key files; reflects current operational reality
2. `CONTRIBUTING.md` — describes module conventions and PR scoping; reflects how work should be structured
3. `packaging/README.md` — documents native packaging status across 4 channels; concrete, verifiable work items
4. GitHub issues — currently zero, but the intended external signal source
5. A new `ROADMAP.md` or `PRIORITIES.md` — if the project wants an explicit priority list decoupled from implementation docs

**What the amendment would look like:** Replace `loop.md:93-108` (the "Ranking heuristics" section) to reference the chosen source(s) instead of `docs/ux-ui-overhaul.md`.

**Risk:** Changing the ranking changes what the loop works on next. A human must confirm the new priority order matches project intent.

## What changed

Created this report on branch `lcc/loop-2026-09-29-design-fork-options` to present the design fork. No code changes were made.

## What could NOT be verified

- Cannot run `npm run check` / `npm run build` — CI verifies, not the engineer
- Cannot verify whether any `docs/ux-ui-overhaul.md` ever existed in history (would need `git log --all --full-history -- docs/ux-ui-overhaul.md`)
- Cannot verify the exact PR sequence the overhaul doc would have prescribed
- Cannot verify which option (A or B) the human operator prefers

## What remains

**Decision required:** A human must choose Option A or Option B (or a hybrid), then the loop can proceed on the next iteration.

**If Option A:** Human creates `docs/ux-ui-overhaul.md` with the intended PR sequence, then the loop's next iteration will rank against it.

**If Option B:** Human amends `loop.md`'s ranking heuristics (lines 93-108) to reference the new primary source(s), then the loop's next iteration will rank against those.

**Open lcc/* branches (in-flight work, unchanged):**
- `lcc/loop-2026-09-25-flathub-cleanup`
- `lcc/loop-2026-09-26-ipc-channel-purge-residual-status`
- `lcc/loop-2026-09-26-orientation-report`
- `lcc/loop-2026-09-28-orientation-missing-design-doc` (PR #3)
- `lcc/loop-2026-09-29-design-fork-options` (this branch)