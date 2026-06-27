# Type Safety Reference

## Strict Compiler Assumptions

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, and
  `erasableSyntaxOnly` are intentional.
- Tests relax `noUncheckedIndexedAccess` only in `tsconfig.test.json`.
- Do not change compiler flags to make a local failure disappear.

## Cast Boundaries

- Prisma JSON casts go through `src/shared/db/prisma-input-json.ts`.
- Conform `FieldMetadata` invariance casts stay inside
  `src/shared/lib/conform/typed-input-control.ts`.
- Section config widening casts are banned by architecture tests.
- SDK or third-party edge casts should be wrapped in a small helper with tests.

## Validation

- Use Zod schemas in `src/shared/lib/validations`.
- Prefer discriminated unions and `superRefine` for cross-field invariants.
- If a DB invariant cannot be represented in Prisma schema, preserve it in
  migration SQL comments, validation, and tests.

## Verification

- `bun run type-check`.
- `bun test __tests__/unit/architecture-boundaries.test.ts`.
- `bun test __tests__/unit/architecture/zod-schema-error-key.test.ts`.
