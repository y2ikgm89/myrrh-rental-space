---
name: next-db-cache-boundaries
description: Use when changing Next.js App Router routes, Server Components, Route Handlers, Prisma/domain/db access, env validation, cache tags, proxy behavior, cron jobs, webhooks, deployment/runtime config, migrations, or privacy/static-rendering behavior in this repository.
---

# Next DB Cache Boundaries

Apply this before edits to route behavior, data access, runtime env, caching,
security headers, webhooks, cron, deployment config, or migrations.

## Checklist

1. Identify the runtime: Server Component, Client Component, Route Handler,
   proxy, instrumentation, script, test, or deploy step.
2. Keep DB access in server-only domain/db modules; never pull Prisma into app
   UI or proxy layers.
3. Preserve cache privacy: private/admin/PII routes use no-store behavior, and
   public cache tags come from repo cache constants/helpers.
4. With Next `cacheComponents: true`, use existing `connection()`,
   `"use cache"`, `cacheLife`, and `cacheTag` patterns. Do not add route
   segment config exports as a workaround.
5. Avoid build-time baking of DB/env fallbacks. Follow runtime-evaluation
   patterns already in the repo.
6. For route handlers, validate requests and return explicit errors. Do not
   reintroduce banned success-boolean wrappers.
7. For webhooks and cron, authenticate or verify signatures first and fail
   closed.
8. For Prisma schema changes, prefer expand/contract, add migrations instead of
   editing old SQL, and run generation.

## Read When Needed

- `references/boundaries.md` for detailed repo rules, migration-baseline
  exception handling, and verification commands.
