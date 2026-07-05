# Migration Rules

Compatibility layer for Claude-oriented references. Canonical Codex guidance is
`AGENTS.md` plus `.agents/skills/next-db-cache-boundaries`.

- Use `bunx --bun prisma migrate dev --name <name>` to create migrations.
- Do not hand-edit existing migration SQL files.
- Prefer expand/contract changes that keep old and new app revisions compatible
  during Cloud Run rollout windows.
- Preserve database invariants that Prisma cannot express, especially CHECK
  constraints, triggers, partial indexes, comments, and production seed data.
- A migration-history baseline reset is a narrow clean-break exception. Only do
  it when the user explicitly approves discarding existing data and production
  will cut over to a new empty Neon database/branch.
- Verify a baseline reset with empty-database `prisma migrate deploy`,
  production seed, schema diff, and Squawk when available. Never run it against
  an already-migrated database.
- Run `bun run db:generate` after schema changes.
- Use `scripts/lint-migrations.ts` for migration SQL safety checks when
  migration files change.
