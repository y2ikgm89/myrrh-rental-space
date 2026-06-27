# Repo Map

## Primary Directories

- `src/app/(public)`: public site, account pages, reservation flow, public
  content routes, metadata, and public layouts.
- `src/app/(admin)`: admin auth, dashboard routes, admin forms, tables,
  editors, settings, and admin-only route handlers.
- `src/app/api`: public API, auth, cron, webhook, export, OAuth, and health
  route handlers.
- `src/shared/domain`: server-only domain query and command modules.
- `src/shared/lib`: reusable pure helpers, env validation, cache helpers,
  integrations, security helpers, validation schemas, and framework glue.
- `src/shared/db`: Prisma singleton, Prisma client construction, JSON helpers,
  and Better Auth adapter support.
- `prisma`: Prisma schema, migrations, and seed script.
- `__tests__`: Bun unit and integration tests.
- `e2e`: Playwright setup, public, smoke, authenticated, accessibility, and
  visual tests.
- `scripts`: Bun and shell automation used by package scripts and hooks.

## High-Risk Surfaces

- `src/proxy.ts`: security headers, CSP, admin gate, cron auth, token transfer,
  and rate limiting. Keep it DB-free.
- `src/shared/lib/env/*`: env schema and production runtime validation.
- `src/shared/db/prisma.ts`: Prisma singleton, adapter-pg, pool tuning, and
  Decimal result extension entry point.
- `src/app/api/webhooks/*`: external signature verification and idempotent side
  effects.
- `src/app/api/cron/*`: bearer-authenticated scheduled work.
- `src/shared/lib/cache/*` and `src/shared/lib/constants/cdn-cache-tags.ts`:
  cache invalidation and Cloudflare purge behavior.
- `prisma/schema.prisma` and `prisma/migrations`: rollout and data loss risk.

## Dependency Boundaries

- App routes call domain queries/commands.
- Domain modules may call Prisma through `@/shared/db/prisma`.
- Shared library code must not depend on admin or public app aliases.
- Public app code must not import the Prisma facade directly.
- Generated Prisma model/client types should not leak into `src/app/*`.
