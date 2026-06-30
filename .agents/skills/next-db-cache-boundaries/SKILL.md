---
name: next-db-cache-boundaries
description: Use when changing Next.js App Router routes, Server Components, Route Handlers, Prisma/domain access, env validation, cache tags, proxy behavior, cron jobs, webhooks, deployment config, or any code that can affect privacy, static rendering, or Cloud Run rollout safety in this repository.
---

# Next DB Cache Boundaries

Apply this skill before edits to route behavior, data access, runtime env,
caching, security headers, webhooks, cron, or migrations.

## Checklist

1. Identify the runtime: Server Component, Client Component, Route Handler,
   proxy, instrumentation, script, or test.
2. Keep DB access in server-only domain/db modules. Do not pull Prisma into app
   UI or proxy layers.
3. Preserve cache privacy: private/admin/PII routes use no-store behavior and
   public cache tags come from `CACHE_TAGS`/`getCacheTag`.
4. Avoid build-time baking of DB/env fallbacks. Follow existing `connection()`
   and runtime-evaluation patterns.
5. For route handlers, use typed request validation and explicit error
   responses. Do not reintroduce legacy success boolean wrappers.
6. For webhooks and cron, verify auth/signature first and fail closed.
7. For Prisma schema changes, prefer expand/contract and run generation.
   Treat migration-history baseline resets as an explicit data-loss exception:
   require user approval, an empty database cutover plan, manual SQL invariant
   preservation, and empty-database `prisma migrate deploy` verification.

## Read When Needed

- `references/boundaries.md` for the repo-specific rules and verification
  commands.
