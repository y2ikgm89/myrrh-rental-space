# Next, DB, Cache, And Route Boundaries

## Runtime Rules

- Server-only DB modules must import `"server-only"`.
- `src/proxy.ts` stays DB-free and performs only edge-safe work.
- Admin and public route handlers should validate inputs with existing Zod
  schemas or a new schema in `src/shared/lib/validations`.
- Do not return legacy `{ success: boolean }` route payloads where architecture
  tests ban them.
- Keep OAuth tokens, API keys, and encrypted envelopes server-only.

## Cache Rules

- `next.config.ts` has `typedRoutes: true` and `cacheComponents: true`.
- Do not add route segment config exports as a cache workaround.
- Use `cacheLife` and `cacheTag` in cached data producers.
- Use `revalidateTag` or cache helpers with tags from `CACHE_TAGS` and
  `getCacheTag`; do not hand-write cache tag strings.
- Private/admin/auth/export/API-with-PII routes must not receive public
  `Cache-Tag` headers.

## Prisma Rules

- Use `@/shared/db/prisma` from domain/db server modules.
- Keep `basePrisma` for Better Auth and `prisma` for app code with Decimal
  conversion.
- After `prisma/schema.prisma` changes, run `bun run db:generate`.
- Do not edit existing migration SQL. Create or regenerate migrations.
- Preserve CHECK constraints and comments that Prisma introspection cannot
  represent.
- Migration-history baseline resets are only valid as explicit data-loss
  clean-break work. Require a new empty Neon database/branch cutover, generate
  from the current Prisma schema, preserve manual SQL constraints/triggers and
  production initial data, and verify with `prisma migrate deploy` on an empty
  database before PR.

## Verification

- Next and types: `bun run type-check`.
- Architecture boundaries: `bun test __tests__/unit/architecture-boundaries.test.ts`.
- Cache tag contract: same architecture test, focused near `next.config`.
- Prisma schema: `bun run db:generate` plus relevant domain tests.
- Baseline migration reset: empty Postgres `prisma migrate deploy`, production
  seed once, Prisma diff back to schema is empty, and Squawk passes on the
  baseline SQL.
- Webhook/cron/proxy: focused route tests plus `bun run validate` when practical.
