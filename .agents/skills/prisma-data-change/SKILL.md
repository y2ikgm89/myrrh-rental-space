---
name: prisma-data-change
description: Use when changing Prisma schema, migrations, generated Prisma types, seed data, database access helpers, Prisma enum mappings, or scripts that read/write database records. Do not use for UI-only changes or pure query consumers that do not alter data contracts.
---

# Prisma Data Change

## Workflow

1. Identify the data contract being changed: Prisma model, enum, relation, JSON shape, migration, seed, or query helper.
2. Keep Prisma client construction in `src/shared/db/create-app-prisma-client.ts` and data access behind `src/shared/db/*` or `src/shared/domain/*`.
3. Validate external input before it reaches Prisma. Use Zod `safeParse` and avoid untyped JSON writes.
4. For enum changes, update Prisma schema, generated type gateways, seed data, tests, and UI option lists in the same change.
5. Run `bun run db:generate` after schema changes before TypeScript checks.
6. Add targeted Bun tests for domain behavior, serialization, or migration-sensitive transforms.
7. Treat committed migration history as immutable once it may have reached any shared database. Retire tables, columns, or enums with a follow-up migration instead of deleting or rewriting an earlier migration.
8. When doing a clean break that drops data, state whether data migration is intentionally omitted or provide an explicit migration path.
9. Do not keep compatibility branches for retired schema shapes unless the user explicitly asks for a migration period.

## Guardrails

- Do not import `@/shared/db/prisma` directly from `src/app/`, except the documented `calendar-sync` exception.
- Do not use raw SQL unless Prisma cannot express the operation and the query is reviewed for injection safety.
- Do not edit generated files by hand.
- Do not run destructive migrations or broad data cleanup without explicit user approval, even when the schema change itself is a clean break.

## Validation

- Schema/type changes: `bun run db:generate`.
- Targeted domain or db tests first.
- Minimum completion gate: `bun run validate`.
- Before PR / release / commit: `bun run validate && bun run build`.
