# Report: 2026-10-02-update-plan-priorities

### Candidate chosen
Updated `PLAN.md` with actionable priorities derived from the orientation sources per `loop.md` ranking heuristics.

### Reasoning
The original `PLAN.md` contained two meta-items that were already complete:
1. Create missing `PLAN.md` file — done (this file)
2. Investigate/create `docs/ux-ui-overhaul.md` — done on 2026-10-02 via PR #6

Per `loop.md`'s ranking heuristics ("Existence & intent integrity" = priority #1), the plan should reflect current reality, not stale completion items. The orientation sources (`loop.md:109-119`) provide concrete, verifiable work:
- `docs/ux-ui-overhaul.md` → 6-step PR sequence (Tokens → Primitives → Shell → Home → Layout Contract → Chrome A11y)
- `packaging/README.md` → native packaging blockers (release must be published, checksums updated, Flathub manifest fixed)
- `AGENTS.md` → privilege model, helper whitelist audit, security panel persistence

The in-flight work (`lcc/loop-2026-10-04-tokens-design-system` / PR #7) matches step 1 of the overhaul sequence.

### Changes
Updated `PLAN.md`:
- **Now (hours)**: Replaced stale meta-items with the 6-step UX/UI overhaul sequence from `docs/ux-ui-overhaul.md`, marking Tokens as in-flight via PR #7
- **Next (days)**: Added concrete packaging and security items from `packaging/README.md` and `AGENTS.md`
- Added orientation sources reference section for traceability

### Verification
None required (documentation only). CI will run `npm run check` / `npm run build` on the branch but no code changes were made.

### What could NOT be verified
- Cannot run `npm run check` / `npm run build` — CI verifies, not the engineer
- Cannot verify human intent for priority ordering beyond what orientation sources state

### What remains
- Tokens PR (#7) merges → loop picks up Primitives next
- Human publishes `v0.1.0` release (un-drafts) to unblock native packaging
- Loop report written and branch pushed — this iteration complete