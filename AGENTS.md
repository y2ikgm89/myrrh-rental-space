# AGENTS.md

## Scope

This file is the repository-level instruction source for Codex and other coding
agents working in this repository.

Keep this file compact. Codex stops loading project instructions when the
combined instruction size reaches its configured limit, so detailed workflows
belong in repo skills under `.agents/skills`.

## Local-First Rule

- Use only the current workspace as the source of project truth unless the user
  explicitly asks for history, GitHub, issues, pull requests, or remote state.
- Do not consult `git log`, `git blame`, GitHub, prior memories, or generated
  old work notes for project decisions unless explicitly requested.
- Prefer `rg`, local files, `codebase-memory-mcp`, and focused official docs.
- Use Context7 before answering or coding against library, framework, SDK, CLI,
  or cloud-service APIs.

## Stack Snapshot

- Package manager/runtime: Bun `1.3.14` via `packageManager`.
- App: Next.js `16.2.x` App Router, React `19.2.x`, TypeScript `6.x`.
- Data: Prisma `7.x`, PostgreSQL, generated client in `generated/prisma`.
- UI: route groups under `src/app/(public)` and `src/app/(admin)`, Tailwind v4
  CSS, shadcn-style admin components, Tabler icons.
- Auth and integrations: Better Auth, Stripe, Resend, Google APIs, Cloudflare
  R2/CDN, Turnstile, Playwright.
- Tests: Bun unit/integration tests with a per-file isolation runner, plus
  Playwright E2E, accessibility, smoke, authenticated, and visual projects.

## Required Commands

- Install: `bun install`.
- Dev server: `bun run dev`.
- Prisma client: `bun run db:generate`.
- Type check: `bun run type-check`.
- Lint: `bun run lint`.
- Full validation gate: `bun run validate`.
- Unit tests: `bun run test:unit`.
- Integration tests: `bun run test:integration`.
- One test file: `bun scripts/run-tests.ts path/to/file.test.ts`.
- E2E: `bun run e2e`.
- Production build without strict env validation: `bun run build:skip-env`.

Run the narrowest command that proves the change, then run broader gates when
the touched surface is shared, security-sensitive, or build-sensitive.

## Architecture Rules

- Keep app routes thin. Put reusable server logic in `src/shared/domain/*` as
  query/command modules and reusable pure helpers in `src/shared/lib/*`.
- Do not import Prisma directly from app layers. Use `@/shared/db/prisma` only
  from server-only domain/db code. Files importing it must also import
  `"server-only"`.
- Do not import `@generated/prisma/client` from `src/app/*`. Prefer domain
  types, generated enums gateway files, or local DTOs.
- `src/shared/*` must not import `@/admin/*` or `@/public/*`.
- Keep `src/proxy.ts` free of DB-backed modules. It owns security headers,
  CSP nonce propagation, admin gate, cron auth, token transfer, and rate limits.
- Use `serverEnv`/`clientEnv` from `src/shared/lib/env/*`; do not scatter new
  ad hoc `process.env` reads in application logic.
- Cache tags must flow through `CACHE_TAGS` and `getCacheTag` from
  `src/shared/lib/constants/cdn-cache-tags.ts`.
- With `cacheComponents: true`, do not add route segment config exports as a
  workaround. Follow the existing `connection()`, `"use cache"`, `cacheLife`,
  and `cacheTag` patterns.
- Treat `TermsAgreement` as append-only. Do not introduce update/delete/upsert
  flows for agreement records.

## Prisma And Migrations

- Run `bun run db:generate` after schema changes.
- Create migrations with `bunx --bun prisma migrate dev --name <name>`.
- Do not edit existing `prisma/migrations/*/migration.sql` files. Add a new
  migration or regenerate before sharing.
- Do not run destructive DB commands such as `bun run db:reset`,
  `prisma migrate reset`, `prisma db push`, or `prisma db pull` unless the user
  explicitly asks and the target database is verified.
- Preserve expand/contract compatibility for Cloud Run rollout windows.
- Exception: a migration-history baseline reset is allowed only when the user
  explicitly approves discarding existing data and production will cut over to a
  new empty Neon database/branch. Generate the baseline from the current Prisma
  schema, preserve manual SQL invariants and production initial data, verify it
  with `prisma migrate deploy` on an empty database, and do not deploy it to an
  already-migrated database.

## Testing Standards

- Bun tests run through `scripts/run-tests.ts` for per-file process isolation.
- Integration tests that share Postgres are serialized by the runner; do not
  bypass that design for speed.
- Playwright tests should use semantic locators and web-first assertions.
  Avoid `page.waitForTimeout`, `waitForLoadState("networkidle")`, and
  `page.waitForURL`; use `expect(locator)` and `expect(page).toHaveURL()`.
- For UI changes, cover the smallest reliable layer first: pure helper test,
  component/unit test, then Playwright only when behavior spans the browser.
- For admin UI changes, also run
  `bun test __tests__/unit/architecture/admin-design-tokens.test.ts` and
  `bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts`.

## Security And Secrets

- Never print, copy, or commit secret values. `.env*` files other than examples
  are protected files.
- Keep production-only secrets validated by `validateProductionEnv()` and avoid
  build-time baking of placeholder env values.
- Webhook and cron routes must fail closed, validate signatures or bearer
  tokens, and avoid legacy success boolean wrappers.
- External URL fetches must use the existing SSRF guard or a domain-specific
  safe helper.

## Repo Skills

Use repo skills when their description matches the task:

- `$project-workflow` for general implementation, review, debugging, or planning
  in this repository.
- `$next-db-cache-boundaries` for App Router, Prisma, env, cache, route handler,
  cron, webhook, proxy, or deployment-sensitive work.
- `$e2e-test-quality` for Playwright E2E, smoke, accessibility, auth setup, or
  visual test work.
- `$type-safety` for TypeScript strictness, Zod, Conform, Prisma JSON, generated
  types, or assertion/cast changes.
- `$admin-ui-review` for admin UI components, forms, tables, dialogs, tokens,
  and layout reviews.

## Subagents

Use custom subagents from `.codex/agents` only when the work can be split into
independent read-heavy or review-heavy tasks. Ask them for concise findings with
file references, not raw logs. Avoid parallel write-heavy edits unless the user
explicitly asks for that workflow.

## Context Discipline

- Start with targeted reads. Do not dump large files into context when `rg`,
  `codebase-memory-mcp`, or a small section read is enough.
- Summarize command output and keep raw logs out of the main thread unless they
  contain the failure.
- Keep changes scoped to the requested surface and existing local patterns.
- Prefer improving an existing tested boundary over adding a new abstraction.
