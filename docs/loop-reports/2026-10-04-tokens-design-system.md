# Report: 2026-10-04-tokens-design-system

### Candidate chosen
Create design tokens foundation (first stage of UX/UI overhaul per `docs/ux-ui-overhaul.md`).

### Reasoning
Per `loop.md` ranking heuristics, the `docs/ux-ui-overhaul.md` PR sequence is priority #1. Its first stage is "Tokens: Establish color, spacing, and typography primitives." The current codebase has CSS custom properties in `app.css` but no TypeScript-accessible token system — creating `src/renderer/src/lib/tokens.ts` establishes the single source of truth that both CSS and Svelte components can consume.

### Changes
Created `src/renderer/src/lib/tokens.ts` with:
- **color**: Base palette (matching existing CSS custom properties), status tokens (`status-ok`, `status-warn`, `status-fail`)
- **spacing**: 4px base unit scale (`space-0` through `space-16`)
- **typography**: Font families (Inter, JetBrains Mono), type scale (`text-xs` through `text-4xl`), font weights
- **radius**: Border radius scale
- **shadow**: Shadow elevation scale
- **transition**: Transition duration/easing scale
- **zIndex**: Z-index layering scale
- Helper functions: `cssVar()` for CSS variable references, `getToken()` for type-safe access

### Verification
- CI will verify TypeScript compilation on the branch (`.github/workflows/ci.yml` triggers on `lcc/**` pushes)
- Cannot run `npm run check` / `npm run build` locally — CI is the verifier
- Tokens mirror existing CSS custom properties in `app.css`; visual parity not regressed

### What could NOT be verified
- No visual regression testing (CI doesn't launch Electron)
- No component migration yet — this is the foundation only
- Token values hardcoded to match current `app.css`; drift detection would require a build-time check (future work)

### What remains
- **Stage 2 (Primitives)**: Build atomic UI components (Button, Card, etc.) consuming these tokens
- **Stage 3 (Shell)**: Main application container and navigation layout
- Update `app.css` to derive CSS custom properties from tokens (or add build-time sync)
- Migrate existing Svelte components (`Button.svelte`, `Card.svelte`, etc.) to import from `tokens.ts`
- Add Tailwind config that references tokens for utility-class parity