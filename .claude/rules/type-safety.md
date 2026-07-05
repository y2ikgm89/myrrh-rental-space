# Type Safety Rules

Compatibility layer for Claude-oriented references. Canonical Codex guidance is
`AGENTS.md` plus `.agents/skills/type-safety`.

- Keep TypeScript strict flags intact.
- Do not use broad `any`, non-null assertions, or caller-side assertion casts to
  bypass schema/type mismatches.
- Prisma JSON conversion must use `src/shared/db/prisma-input-json.ts`.
- Conform `FieldMetadata` generic-invariance casts must stay inside
  `src/shared/lib/conform/typed-input-control.ts`.
- Use Zod 4 `{ error: "..." }` style for new schema messages.
- Generated Prisma client/model types must not leak into `src/app/*`.
- App-safe generated enums should flow through
  `src/shared/lib/validations/enums/prisma-types.ts`.
- Verify with `bun run type-check` and
  `bun test __tests__/unit/architecture-boundaries.test.ts`.
