---
name: admin-clean-break
description: Use when adding or refactoring admin dashboard features, Server Actions, data mutations, or clean-break replacements in this repository. Do not use for public-only visual polish or one-off documentation edits.
---

# Admin Clean Break

## Workflow

1. Identify whether the feature belongs to admin, public, or shared code. Keep admin-only UI under `@/admin/*`.
2. Prefer Server Components. Add `'use client'` only for interactive islands.
3. Validate every external or form input with Zod `safeParse`.
4. Route admin write operations through `executeAdminMutationResult`.
5. Use `updateTag()` after writes that affect cached reads.
6. Add `logAction()` for audited operations.
7. Remove old code paths instead of keeping compatibility shims when the user has approved a clean break.
8. Add targeted tests for domain logic and mutation behavior before broad validation.

## Guardrails

- Do not import `@/shared/db/prisma` directly from `src/app/`, except the documented `calendar-sync` exception.
- Do not bypass RBAC through ad-hoc permission checks in Server Actions.
- Do not add hardcoded Tailwind colors; use semantic tokens.
- Do not introduce `forwardRef` or unnecessary `useMemo` / `useCallback`.

## Validation

- Targeted domain/action tests first.
- Then run `bun run validate`.
- Before PR / release / commit, run `bun run validate && bun run build`.
