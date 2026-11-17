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
   drift-checks it), does it touch `helper/l
