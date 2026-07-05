# Admin UI Reference

## Locations

- Admin routes: `src/app/(admin)/admin/(dashboard)`.
- Shared admin components: `src/app/(admin)/admin/(dashboard)/_shared`.
- Admin CSS and tokens: `src/app/(admin)/_styles/admin.css`.
- shadcn-style aliases: `@/admin/components/ui`, `@/admin/hooks`.

## Patterns

- Prefer existing UI primitives in `_shared/components/ui`.
- Keep table rows, filters, tabs, dialogs, and forms consistent with nearby
  screens.
- Use Tabler icons through existing imports.
- Do not create nested cards for page structure. Use cards for repeated items,
  framed tools, and dialogs only.
- Avoid oversized headings inside dense admin surfaces.
- Text must not overflow buttons, tabs, badges, or cells.
- Use existing typed form helpers and validation schemas.
- Preserve loading, empty, error, disabled, pending, and optimistic states when
  changing workflows.

## Verification

- `bun test __tests__/unit/architecture/admin-design-tokens.test.ts`.
- `bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts`.
- Relevant component/unit tests under `__tests__/unit/components/admin`.
- Playwright admin tests when workflow behavior changes.
