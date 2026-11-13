# PLAN.md

The Linux Command Centre improvement plan.

## Completed
- [x] Create missing `PLAN.md` file to track project progress.
- [x] Investigate/create `docs/ux-ui-overhaul.md` as per references in `loop.md`.
- [x] Foundational design tokens and CSS status variables (`src/renderer/src/app.css`).
- [x] UI primitive components in `src/renderer/src/components/ui/` (`Button`, `Card`, `Dialog`, `Toggle`, `Skeleton`, `Listbox`, `ConfirmDialog`, `EmptyState`, `SearchField`, `SegmentedControl`).
- [x] Navigation and theme state stores (`src/renderer/src/stores/nav.ts`, `theme.ts`).

## Now (hours)
- [ ] Refactor shell & navigation layout (`src/renderer/src/App.svelte`) to integrate primitive UI components and `theme.ts` store.
- [ ] Redesign Overview / Home panel using new card, badge, and status primitives.
- [ ] Enforce panel cluster layout contracts across system, network, and storage panels.

## Next (days)
- [ ] Accessibility review across design system primitives (`a11y` attributes, keyboard focus management).
- [ ] Command palette enhancements with filterable APG combobox support.
- [ ] RootWatch offline report queue monitoring and status integration.

## Later (weeks)
- [ ] End-to-end integration test coverage for privileged helper operations and IPC calls.
