# myrrh-rental-space

Booking site for a rental space. A single Next.js repo ships as two Cloud Run
services — the public storefront and the admin dashboard — split by the
`APP_SURFACE` environment variable.

## Stack

- **Bun 1.3.14** (SSoT is `packageManager` in `package.json`) / TypeScript 6
- **Next.js 16** App Router — PPR + `"use cache"` (`cacheComponents: true`),
  React Compiler, typedRoutes
- **React 19** / **Tailwind v4** (CSS-first, no `tailwind.config`)
- **Prisma 7** + **PostgreSQL 18** — client is generated to `generated/prisma`
  (git-ignored)
- **Better Auth** (customers) / **Cloud Run IAP** (admin only)
- Tests: **`bun test`** through `scripts/run-tests.ts` + **Playwright**
- Deploy: **Cloud Build → Artifact Registry → Cloud Run**, manual only via
  `workflow_dispatch` on `.github/workflows/deploy-production.yml`
  (`main` merge does **not** deploy Cloud Run)

## Getting started

Install dependencies first (`bun install` is not part of `bun run setup`).

### Short path

```sh
bun install
bun run setup          # .env.local (if missing) + db/test-db + migrate deploy + seed
bun run dev            # http://localhost:3000
```

### Manual path

```sh
bun install
cp .env.example .env.local
docker compose up -d db          # add test-db when running integration tests
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev                      # http://localhost:3000
```

### Environment notes

- Copy `.env.example` to `.env.local`. **Production-only secrets** (e.g.
  `ENCRYPTION_KEY`, `AUDIT_LOG_HMAC_KEY`, Cloudflare production tokens) can stay
  empty locally — local dev does not require them.
- If `BETTER_AUTH_SECRET` is still a placeholder, generate one:
  `openssl rand -base64 32`
- `APP_SURFACE` in `.env.example` selects which surface this process serves:
  `admin` (dashboard + IAP bypass locally) or `public` (storefront). Two Cloud
  Run services in production; locally you usually run one dev server at a time.
- **Local admin**: set `ADMIN_TEST_IAP_EMAIL` (default in `.env.example`) and
  run seed → open `http://localhost:3000/admin`. No app password or login-token
  URL locally.
- Deeper local admin / customer dev-login notes:
  [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)

Humans own the long-running dev server — start `bun run dev` yourself and leave
it running; assistants should not start or stop it unless asked.

## Smallest proof

Before a full `bun run validate`, prove a focused change with narrow commands:

```sh
bun scripts/run-tests.ts path/to/file.test.ts
# or
bun run test -- path/to/file.test.ts

bun run lint:files -- path/to/changed.ts
```

Then run `bun run validate` (type-check + lint only, **not** tests) before
commit; `bun run validate && bun run build` before push (see
[CLAUDE.md](CLAUDE.md)).

## Common commands

| Command                    | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `bun run setup`            | One-shot local DB setup (migrate deploy + seed)     |
| `bun run validate`         | **type-check + lint** (does NOT run tests)          |
| `bun run test`             | Test runner alias → `scripts/run-tests.ts`          |
| `bun run test:unit`        | Unit tests, per-file isolated subprocess            |
| `bun run test:integration` | Integration tests against `test-db` (auto-migrated) |

### Integration tests (local)

Integration tests use a **separate PostgreSQL instance** (`test-db`, port
5433 by default). The runner applies migrations automatically; you only need
the database running and `TEST_DATABASE_URL` set.

```sh
# Recommended: bootstrap app + test DB together
bun run setup          # docker compose up db + test-db, migrate, seed

# Or start test-db only when app DB is already up
docker compose up -d test-db

# Same entry as CI
bun run test:integration

# Single file
bun scripts/run-tests.ts __tests__/integration/<path>.test.ts
```

`bun run setup` copies `.env.example` → `.env.local` when missing; that file
includes `TEST_DATABASE_URL` for the local test database. Override it if your
Docker port mapping differs.
| `bun scripts/run-tests.ts <path>` | One test file — always use this, not bare `bun test` |
| `bun run lint:files -- <paths>` | ESLint on specific files only |
| `bun run build` | Production build (strict env validation) |
| `bun run build:skip-env` | Production build with placeholder env (offline) |
| `bun run db:migrate --name <name>` | New Prisma migration + apply |
| `bunx playwright test --project=chromium-smoke` | E2E smoke — same as CI required gate |
| `bun run lint-format` | ESLint + Prettier (whole repo) |

Before committing: `bun run validate && bun run build`. Push runs a lefthook
pre-push hook (type-check + architecture-boundaries) that takes ~80–110s, so
`git push` needs at least a 3-minute tool timeout.

## Health endpoints

| Path          | Role                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| `/api/live`   | Liveness — no external deps; Cloud Run probes; public on both surfaces |
| `/api/health` | Admin-surface only — DB connectivity check; public returns 404         |

Implementation: `src/app/api/live/route.ts`, `src/app/api/health/route.ts`.

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
- Human contributor setup & workflow: [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)
- Topic-specific guardrails: [`.claude/rules/`](.claude/rules/)
- Multi-step workflows (migrations, adding a section, deploy debugging):
  [`.claude/skills/`](.claude/skills/)
- Production runbook: [docs/gcp-production-setup.md](docs/gcp-production-setup.md)
