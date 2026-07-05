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

## Generated Prisma Types And Enums

- Generated Prisma client imports belong in server-only domain/db code.
- App-safe Prisma enum gateway:
  `src/shared/lib/validations/enums/prisma-types.ts`.
- Enum guards and labels live under `src/shared/lib/validations/enums/*`.
- The gateway may import generated `browser` or `enums` entries only; do not
  make it re-export the generated client.

## Validation

- Use Zod schemas in `src/shared/lib/validations`.
- For Zod 4, prefer `{ error: "..." }` issue customization and top-level string
  formats such as `z.iso.datetime()`.
- Prefer discriminated unions and `superRefine` for cross-field invariants.
- If a DB invariant cannot be represented in Prisma schema, preserve it in
  migration SQL comments, validation, and tests.

## Verification

- `bun run type-check`.
- `bun test __tests__/unit/architecture-boundaries.test.ts`.
- `bun test __tests__/unit/architecture/zod-schema-error-key.test.ts`.
