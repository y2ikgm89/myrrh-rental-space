# DB And Domain Rules

Compatibility layer for Claude-oriented references. Canonical Codex guidance is
`AGENTS.md` plus `.agents/skills/next-db-cache-boundaries`.

- Put reusable server-side reads and writes in `src/shared/domain/*`.
- Files importing `@/shared/db/prisma` must import `"server-only"`.
- Keep Prisma out of `src/app/*` UI layers and out of `src/proxy.ts`.
- Keep Cache Components data producers and revalidation calls out of
  `src/proxy.ts`; use app/domain modules, Server Functions, or Route Handlers.
- Use `basePrisma` only for Better Auth integration and `prisma` for app domain
  code.
- Preserve runtime evaluation for DB-backed metadata, manifest, icon, sitemap,
  and public layout paths that can be statically baked by Next.js.
- Use `CACHE_TAGS`, `CDN_CACHE_TAGS`, `getCacheTag`, and `joinCacheTags` for
  cache invalidation and CDN tag values.
- Reservation availability writes must use
  `src/shared/domain/reservations/locks.ts` inside the same Prisma transaction
  as overlap checks and writes.
