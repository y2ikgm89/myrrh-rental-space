# Next, DB, Cache, And Route Boundaries

## Runtime Rules

- Server-only DB modules must import `"server-only"`.
- `src/proxy.ts` stays DB-free and performs only request-bound proxy work:
  security headers, CSP nonce propagation, gating, token transfer, rate limits,
  redirects, rewrites, and response/header mutation.
- Do not import domain/db modules, Cache Components data producers, or
  revalidation helpers from `src/proxy.ts`. Move data reads and cache
  invalidation to app/domain modules, Server Functions, or Route Handlers.
- Admin and public route handlers should validate inputs with existing Zod
  schemas or a new schema in `src/shared/lib/validations`.
- Do not return legacy `{ success: boolean }` route payloads where architecture
  tests ban them.
- Keep OAuth tokens, API keys, encrypted envelopes, IAP identity, and audit
  signing keys server-only.
- Direct `process.env` reads belong in config/build/test harnesses or
  `src/shared/lib/env/*`; app logic should use `serverEnv`/`clientEnv`.
- Turnstile secret keys are managed from the admin settings page and stored
  encrypted in the database. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is deploy-time
  public config. `CLOUDFLARE_ORIGIN_HEADER_SECRET` is Secret Manager-backed
  runtime config.
- `E2E_RUNTIME`, `ADMIN_TEST_IAP_EMAIL`, and
  `NEXT_PUBLIC_ENABLE_E2E_LOGIN` are localhost-only Playwright runtime
  exceptions. Do not use `CI=true` alone as an auth bypass.
- Turnstile-protected public/customer mutations must call server-side
  Siteverify and fail closed in production when config is missing.

## Cache Rules

- `next.config.ts` has `typedRoutes: true` and `cacheComponents: true`.
- Next 16 `cacheComponents` is the current switch for `"use cache"`,
  `cacheLife`, and `cacheTag`.
- Do not add route segment config exports to work around caching. Use
  `connection()` for runtime-only route evaluation and `"use cache"` only in
  app/domain producers that are safe to share.
- Use `cacheLife` and `cacheTag` in cached data producers.
- Use `revalidateTag`, `updateTag`, or cache helpers with tags from
  `CACHE_TAGS`, `CDN_CACHE_TAGS`, `getCacheTag`, and `joinCacheTags`.
- Private/admin/auth/export/API-with-PII routes must not receive public
  `Cache-Tag` headers.
- `next.config.ts` is the SSoT for public blanket cache headers and private
  route cache blocklists.

## Prisma Rules

- Prisma 7 uses `generator client { provider = "prisma-client"; output =
"../generated/prisma" }`.
- `engineType = "client"` requires a driver adapter; this repo uses
  `@prisma/adapter-pg` in `src/shared/db/prisma.ts`.
- Use `@/shared/db/prisma` from domain/db server modules.
- Keep `basePrisma` for Better Auth and `prisma` for app code with Decimal
  conversion.
- Keep generated Prisma client imports out of app layers.
- App-safe enum imports should use
  `@/shared/lib/validations/enums/prisma-types`.
- Reservation create/update/re-confirm paths must call
  `lockReservationSpaceForTransaction` in the same interactive transaction as
  `checkReservationOverlap` and the write.
- After `prisma/schema.prisma` changes, run `bun run db:generate`.
- Do not edit existing migration SQL. Create or regenerate migrations.
- Preserve CHECK constraints, triggers, comments, partial indexes, and seed data
  that Prisma schema/introspection cannot represent.

## Migration Baseline Reset

A migration-history baseline reset is a clean-break exception, not normal
migration work. It is valid only when the user explicitly approves discarding
existing data and production will cut over to a new empty Neon database/branch.

Required proof before sharing:

- Generate the baseline from the current Prisma schema.
- Preserve manual SQL invariants and production initial data.
- Verify `prisma migrate deploy` on an empty Postgres database.
- Run the production seed once against that disposable database.
- Confirm Prisma diff back to `schema.prisma` is empty.
- Run Squawk on the baseline SQL when available.
- Do not deploy the reset to an already-migrated database.

## Verification

- Next/types: `bun run type-check`.
- Architecture boundaries: `bun test __tests__/unit/architecture-boundaries.test.ts`.
- Prisma adapter contract:
  `bun test __tests__/unit/architecture/prisma-adapter-pg-config.test.ts`.
- Cache tag contract: focused architecture tests around `next.config.ts` and
  CDN tag constants.
- Prisma schema: `bun run db:generate` plus relevant domain tests.
- Webhook/cron/proxy: focused route tests plus `bun run validate` when
  practical.
- Env/deploy secrets: `bun test __tests__/unit/lib/env/server-production-env.test.ts`
  and `bun test __tests__/unit/architecture/deploy-production-workflow.test.ts`.
