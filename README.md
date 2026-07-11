# myrrh-rental-space

Booking site for a rental space. A single Next.js repo ships as two Cloud Run
services — the public storefront and the admin dashboard — split by the
`APP_SURFACE` environment variable.

## Stack

- **Bun 1.3.14** (SSoT is `packageManager` in `package.json`) / TypeScript 6
- **Next.js 16** App Router — PPR + `"use cache"` (`cacheComponents: true`),
  React Compiler, typedRoutes
- **React 19** / **Tailwind v4** (CSS-first, no `tailwind.config`)
- **Prisma 7** + **PostgreSQL 16** — client is generated to `generated/prisma`
  (git-ignored)
- **Better Auth** (customers) / **Cloud Run IAP** (admin only)
- Tests: **`bun test`** through `scripts/run-tests.ts` + **Playwright**
- Deploy: **Cloud Build → Artifact Registry → Cloud Run**, `git push main` →
  production

## Getting started

```sh
bun install
cp .env.example .env.local     # fill in DATABASE_URL and secrets
docker compose up -d db        # dev Postgres on :5432
bun run db:generate
bun run db:migrate
bun run dev                    # http://localhost:3000
```

Run `bun run dev` yourself and leave it running; the assistant should not
start or stop it.

## Common commands

| Command                                         | Purpose                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `bun run validate`                              | **type-check + lint** (does NOT run tests)           |
| `bun run test:unit`                             | Unit tests, per-file isolated subprocess             |
| `bun run test:integration`                      | Integration tests against `test-db` (auto-migrated)  |
| `bun scripts/run-tests.ts <path>`               | One test file — always use this, not bare `bun test` |
| `bun run build`                                 | Production build (strict env validation)             |
| `bun run build:skip-env`                        | Production build with placeholder env (offline)      |
| `bun run db:migrate --name <name>`              | New Prisma migration + apply                         |
| `bunx playwright test --project=chromium-smoke` | E2E smoke — same as CI required gate                 |
| `bun run lint-format`                           | ESLint + Prettier                                    |

Before committing: `bun run validate && bun run build`. Push runs a lefthook
pre-push hook (type-check + architecture-boundaries) that takes ~80–110s, so
`git push` needs at least a 3-minute tool timeout.

## Repo layout

- `src/app/(public)` and `src/app/(admin)` — Multiple Root Layouts, each with
  its own `<html>`. Cross-navigation is a full page reload.
- `src/shared/domain/*` — reusable server logic. Only this and `src/shared/db`
  may touch Prisma directly.
- `src/shared/lib/*` — pure helpers and cross-cutting infrastructure.
- `prisma/` — schema + migrations. Never edit existing migration SQL
  (pre-commit blocks it) — add a new migration instead.
- `__tests__/unit`, `__tests__/integration` — Bun tests. `e2e/` — Playwright
  (`*.spec.ts`).

## Path aliases

- `@/shared/*` → `src/shared/*`
- `@/admin/*` → `src/app/(admin)/admin/(dashboard)/_shared/*`
- `@/public/*` → `src/app/(public)/_shared/*`
- `@generated/*` → `generated/*`

## Where to look next

- Working with an agent (Claude Code / Codex): [CLAUDE.md](CLAUDE.md)
- Topic-specific guardrails: [`.claude/rules/`](.claude/rules/)
- Multi-step workflows (migrations, adding a section, deploy debugging):
  [`.claude/skills/`](.claude/skills/)
- Production runbook: [docs/gcp-production-setup.md](docs/gcp-production-setup.md)
