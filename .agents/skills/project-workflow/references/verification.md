# Verification

## Default Gates

- Type and route types: `bun run type-check`.
- Lint: `bun run lint`.
- Combined fast gate: `bun run validate`.
- Unit tests: `bun run test:unit`.
- Integration tests: `bun run test:integration`.
- One Bun test file: `bun scripts/run-tests.ts path/to/file.test.ts`.
- E2E: `bun run e2e`.
- Build without production env secrets: `bun run build:skip-env`.

## Selection

- Docs, instructions, rules, or agent files: run format/syntax checks when
  available; otherwise use targeted `rg` consistency checks. For Codex
  customization changes, use the official Codex manual/OpenAI docs path first.
- Type-only or route-type change: run `bun run type-check`.
- Shared helper or validation schema: run the specific unit test, then
  `bun run type-check`.
- Domain command/query: run the closest unit/integration test and
  `bun run type-check`.
- Prisma schema: run `bun run db:generate`, a relevant test, and
  `bun run type-check`.
- Route handler, webhook, cron, proxy, auth, env, cache, or security change:
  run focused tests plus `bun run validate` when practical.
- Production env or deploy-secret changes: run focused env/deploy architecture
  tests plus `bun run validate`.
- UI-only change: run focused component/unit tests; use Playwright only when
  behavior depends on browser interaction or layout.
- Admin UI change: also run the admin design-token and submit-button
  architecture tests named in `AGENTS.md`.
- Playwright test change: run the specific file or project, then the relevant
  smoke/auth setup if auth state was touched.

Use `$next-db-cache-boundaries` for migration-history baseline reset
verification; that exception is intentionally owned there.
