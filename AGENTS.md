# AGENTS.md

## Scope

This is the root instruction source for agents working in this repository.
Keep it compact. Put reusable workflows and detailed guardrails in repo skills
under `.agents/skills`.

## Source Of Truth

- Use the current workspace as project truth. Do not use `git log`,
  `git blame`, GitHub, prior memories, old notes, or remote project state unless
  the user explicitly asks.
- Use `rg`, targeted file reads, `codebase-memory-mcp`, and focused official
  docs before broad searches.
- Use Context7 before answering or coding against libraries, frameworks, SDKs,
  CLIs, or cloud services. Start with `resolve-library-id`, then `query-docs`.
- For Codex behavior, use the official Codex manual/OpenAI docs path before
  changing `.codex`, skills, rules, hooks, plugins, MCP, or subagents.
- Never print, copy, or commit secret values. Treat non-example `.env*` files
  as protected.

## Stack Snapshot

- Runtime/package manager: Bun `1.3.14` via `packageManager`.
- App: Next.js `16.2.x` App Router, React `19.2.x`, TypeScript `6.x`.
- Data: Prisma `7.x`, PostgreSQL, generated client in `generated/prisma`,
  `@prisma/adapter-pg`.
- UI: Tailwind v4 CSS, shadcn-style admin components, Tabler icons.
- Auth/integrations: Better Auth, Stripe, Resend, Google APIs, Cloudflare
  R2/CDN, Turnstile.
- Tests: Bun unit/integration tests plus Playwright smoke, public,
  authenticated, accessibility, and visual projects.

## Commands

- Install: `bun install`.
- Dev server: `bun run dev`.
- Prisma client: `bun run db:generate`.
- Type check: `bun run type-check`.
- Lint: `bun run lint`.
- Full validation gate: `bun run validate`.
- Unit tests: `bun run test:unit`.
- Integration tests: `bun run test:integration`.
- One Bun test file: `bun scripts/run-tests.ts path/to/file.test.ts`.
- E2E: `bun run e2e`.
- Build without strict env validation: `bun run build:skip-env`.

Run the narrowest command that proves the change. Broaden to `bun run validate`
or build/E2E only when the touched surface is shared, security-sensitive,
browser-dependent, or deployment-sensitive.

## Repo Skills

Start with `$project-workflow` for any local repo implementation, debugging,
review, planning, or documentation task. Add specialized skills by touched
surface:

- `$next-db-cache-boundaries`: Next App Router, Server Components, Route
  Handlers, Prisma/domain/db, env, cache tags, proxy, cron, webhooks, deploy.
- `$type-safety`: TypeScript strictness, Zod, Conform, Prisma JSON, generated
  Prisma enums/types, casts/assertions, type architecture tests.
- `$e2e-test-quality`: Playwright tests, auth setup, smoke/a11y/visual projects,
  browser-driven test flows.
- `$admin-ui-review`: admin dashboard UI, admin forms, tables, dialogs, media
  pickers, settings, editors, design tokens, accessibility.

## Architecture Rules

- Keep app routes thin. Put reusable server logic in `src/shared/domain/*` and
  reusable pure helpers in `src/shared/lib/*`.
- Import Prisma only through `@/shared/db/prisma` from server-only domain/db
  modules. Those files must import `"server-only"`.
- Do not import `@/shared/db/prisma` or `@generated/prisma/client` from
  `src/app/*`. Use DTOs, domain types, or
  `@/shared/lib/validations/enums/prisma-types` for app-safe generated enums.
- `src/shared/*` must not import `@/admin/*` or `@/public/*`.
- Keep `src/proxy.ts` DB-free. It owns security headers, CSP nonce propagation,
  admin gate, cron auth, token transfer, and rate limits. Do not put Cache
  Components data producers or revalidation calls there.
- Use `serverEnv`/`clientEnv` from `src/shared/lib/env/*`; do not scatter new
  ad hoc `process.env` reads in application logic.
- Cache tags must flow through `CACHE_TAGS`, `CDN_CACHE_TAGS`, `getCacheTag`,
  and `joinCacheTags`. Do not hand-write cache tag strings.
- With `cacheComponents: true`, follow the existing app/domain
  `connection()`, `"use cache"`, `cacheLife`, and `cacheTag` patterns. Do not
  add route segment config exports as a cache workaround.
- Route handlers must validate inputs and return explicit error responses. Do
  not reintroduce legacy success-boolean wrappers where architecture tests ban
  them.
- External URL fetches must use the existing SSRF guard or a domain-specific
  safe helper.
- Turnstile-protected mutations must fail closed in production and perform
  server-side Siteverify with the expected action.
- Reservation create/update/re-confirm flows that check availability must take
  `lockReservationSpaceForTransaction` inside the same Prisma transaction
  before overlap checks and writes.
- Treat `TermsAgreement` and `AuditLog` as append-only evidence records.

## Runtime Security

- Production runtime validation must require `TURNSTILE_SECRET_KEY`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `CLOUDFLARE_ORIGIN_HEADER_SECRET`, and the
  existing auth/encryption/database secrets.
- E2E bypass variables (`E2E_RUNTIME`, `ADMIN_TEST_IAP_EMAIL`, and
  `NEXT_PUBLIC_ENABLE_E2E_LOGIN`) are allowed only for localhost
  production-mode Playwright runtime. Do not make `CI=true` a bypass.
- Cloud Run deploys must bind production secrets through Secret Manager
  versions in `cloudbuild.yaml`; do not bake secret values into build args,
  docs, logs, or workflow output.

## Prisma And Migrations

- Run `bun run db:generate` after `prisma/schema.prisma` changes.
- Create migrations with `bunx --bun prisma migrate dev --name <name>`.
- Do not edit existing `prisma/migrations/*/migration.sql` files. Add a new
  migration or regenerate before sharing.
- Do not run `bun run db:reset`, `prisma migrate reset`, `prisma db push`, or
  `prisma db pull` unless the user explicitly asks and the target database is
  verified.
- Preserve expand/contract compatibility for Cloud Run rollout windows.
- A migration-history baseline reset is allowed only after explicit approval to
  discard existing data and cut over production to a new empty Neon
  database/branch. Verify it with empty-database `prisma migrate deploy` before
  sharing.

## Testing Standards

- Bun tests run through `scripts/run-tests.ts` for per-file process isolation.
- Integration tests that share Postgres are serialized by the runner; do not
  bypass that design for speed.
- Playwright tests should use semantic locators and web-first assertions. Avoid
  `page.waitForTimeout`, `waitForLoadState("networkidle")`, and
  `page.waitForURL`.
- For UI changes, cover the smallest reliable layer first: pure helper,
  component/unit test, then Playwright only when behavior spans the browser.
- For admin UI changes, also run
  `bun test __tests__/unit/architecture/admin-design-tokens.test.ts` and
  `bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts`.

## Subagents

Use repo custom subagents from `.codex/agents` only when the user explicitly
asks for subagents or parallel agent work. Prefer read-heavy exploration,
review, security, migration, UI, or test-triage tasks. Ask for concise findings
with file references, not raw logs. Keep write-heavy parallel work disjoint.

## Review Guidelines

When asked for review, lead with findings ordered by severity. Focus on bugs,
regressions, security/privacy risks, data loss, cache invalidation, env
handling, missing tests, and rollout safety. Keep summaries secondary.
