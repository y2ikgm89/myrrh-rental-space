---
name: type-safety
description: Use when changing TypeScript strictness, Zod schemas, Conform field typing, Prisma JSON handling, generated Prisma types/enums, generated enum gateways, casts/assertions, validation helpers, or architecture tests that guard type safety in this repository.
---

# Type Safety

## Rules

1. Keep TypeScript strictness intact: no broad `any`, no non-null assertions,
   and no assertion casts unless a local helper owns the boundary.
2. For Zod 4, use the current `{ error: "..." }` style, not legacy
   `{ message: "..." }` in new schemas.
3. Put reusable validation in `src/shared/lib/validations/*`.
4. Use existing helpers for Prisma JSON conversion, generated enum gateways, and
   Conform generic invariance. Do not scatter caller-side casts.
5. Keep generated Prisma client/model imports out of app layers.
6. Add or update architecture tests when creating a new irreversible boundary.

## Read When Needed

- `references/type-safety.md` for repo-specific guardrails and tests.
