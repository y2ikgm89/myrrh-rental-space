# Type Safety Rules

This file documents current project type-safety boundaries referenced by source
comments and architecture tests. `AGENTS.md` remains the primary agent entry
point.

- Keep TypeScript strict flags intact.
- Do not use broad `any`, non-null assertions, or caller-side assertion casts to
  bypass schema/type mismatches.
- Prisma JSON conversion must use `src/shared/db/prisma-input-json.ts`.
- Conform `FieldMetadata` generic-invariance casts must stay inside
  `src/shared/lib/conform/typed-input-control.ts`.
- Use Zod 4 `{ error: "..." }` style for new schema messages.
- Generated Prisma client/model types must not leak into `src/app/*`.
- Verify with `bun run type-check` and
  `bun test __tests__/unit/architecture-boundaries.test.ts`.
