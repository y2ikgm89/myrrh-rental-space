---
name: project-validation
description: Use before claiming repository work is complete, before PR or release readiness, or when deciding which Bun, Next.js, Playwright, Prisma, or page-builder validation commands to run. Do not use for purely conceptual answers with no repository changes.
---

# Project Validation

## Workflow

1. Identify the changed surface: shared logic, admin UI, public route, Prisma schema, page builder, docs-only, or E2E flow.
2. Run the smallest meaningful targeted test first.
3. Run `bun run validate` before reporting completion.
4. Run `bun run validate && bun run build` before PR, release, or commit readiness.
5. If a command fails, report the exact command and failure class. Do not claim success from stale prior runs.

## Common Commands

- Page builder unit: `bun test __tests__/unit/lib/page-builder`
- Architecture boundary: `bun test __tests__/unit/architecture-boundaries.test.ts`
- Admin page builder E2E: `bun run e2e -- e2e/authenticated/admin/page-builder.spec.ts`
- Full minimum gate: `bun run validate`
- Release gate: `bun run validate && bun run build`
- Freeform data audit: `bun run audit:freeform-pages`

## Notes

- Build can write `.next/` and may need environment-dependent assets.
- If a validation failure is caused by sandbox or network restrictions, retry through the approved escalation path instead of silently skipping it.
- For docs-only changes, `bun run validate` remains the repository minimum because AGENTS.md requires it.
