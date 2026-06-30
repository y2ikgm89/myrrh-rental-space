# Migration Rules

- Use `bunx --bun prisma migrate dev --name <name>` to create migrations.
- Do not hand-edit existing migration SQL files.
- Prefer expand/contract changes that keep old and new app revisions compatible
  during Cloud Run rollout windows.
- Preserve database invariants that Prisma cannot express, especially CHECK
  constraints documented in schema comments and migrations.
- A migration-history baseline reset is a narrow exception, not normal
  migration work. Only do it when the user explicitly approves discarding
  existing data and production will cut over to a new empty Neon database/branch.
  Generate the baseline from the current Prisma schema, keep manual SQL
  invariants and production initial data, validate it with `prisma migrate
deploy` on an empty database, and never run it against an already-migrated
  database.
- Run `bun run db:generate` after schema changes.
- Use `scripts/lint-migrations.ts` for migration SQL safety checks when
  migration files change.
