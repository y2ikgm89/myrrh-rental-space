# Migration Rules

- Use `bunx --bun prisma migrate dev --name <name>` to create migrations.
- Do not hand-edit existing migration SQL files.
- Prefer expand/contract changes that keep old and new app revisions compatible
  during Cloud Run rollout windows.
- Preserve database invariants that Prisma cannot express, especially CHECK
  constraints documented in schema comments and migrations.
- Run `bun run db:generate` after schema changes.
- Use `scripts/lint-migrations.ts` for migration SQL safety checks when
  migration files change.
