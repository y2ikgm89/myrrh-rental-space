# Repo Map

## Primary Directories

- `src/app/(public)`: public site, customer auth/account pages, reservations,
  public content, metadata, and public shared components.
- `src/app/(admin)`: admin auth, dashboard routes, forms, tables, editors,
  settings, admin-only route handlers, and admin shared components.
- `src/app/api`: public API, admin API, auth, cron, webhook, export, OAuth,
  calendar, Instagram, and health route handlers.
- `src/shared/domain`: server-only business query and command modules.
- `src/shared/lib`: pure helpers, env validation, cache helpers, integrations,
  security helpers, validation schemas, pricing, media, email, and framework
  glue.
- `src/shared/db`: Prisma singleton, generated-client construction, JSON
  helpers, and Better Auth adapter support.
- `prisma`: Prisma schema, migrations, and seed script.
- `__tests__`: Bun unit and integration tests, including architecture tests.
- `e2e`: Playwright auth setup, smoke, public, authenticated, accessibility,
  and visual tests.
- `scripts`: validation, type-check, test, deploy, and audit automation.

## High-Risk Surfaces

- `src/proxy.ts`: CSP, security headers, public/admin surface gating, cron auth,
  token transfer, and rate limits. Keep it DB-free and out of Cache Components
  data production or revalidation paths.
- `next.config.ts`: public blanket cache policy, private `no-store` blocklist,
  CDN `Cache-Tag` policy, image remote patterns, standalone deploy toggle.
- `src/shared/lib/env/*`: server/client env schemas and production fail-fast
  validation.
- `src/shared/lib/e2e-runtime.ts`: localhost-only production-mode E2E bypass
  gate for customer dev login and admin test IAP identity.
- `src/shared/db/prisma.ts`: Prisma 7 adapter-pg singleton, pool/timeouts, and
  Decimal conversion.
- `src/app/api/webhooks/*`: external signatures and idempotent side effects.
- `src/app/api/cron/*`: fail-closed scheduled jobs.
- `src/shared/lib/cache/*` and `src/shared/lib/constants/cdn-cache-tags.ts`:
  Next and Cloudflare cache invalidation coupling.
- `prisma/schema.prisma` and `prisma/migrations`: rollout and data-loss risk.
- R2/media/external URL helpers: upload validation, delete behavior, magic
  bytes, and SSRF-safe fetches.
- Reservation availability writes: advisory-lock invariant, see the
  `next-db-cache-boundaries` skill checklist item 9.

## Dependency Boundaries

- App routes call domain queries/commands or route-group components.
- Domain modules may call Prisma through `@/shared/db/prisma`.
- Files importing the Prisma facade must import `"server-only"`.
- Shared library code must not depend on admin or public app aliases.
- App layers must not import the generated Prisma client. Use app-safe DTOs or
  `@/shared/lib/validations/enums/prisma-types` for generated enums.
