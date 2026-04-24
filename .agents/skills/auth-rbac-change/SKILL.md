---
name: auth-rbac-change
description: Use when changing Better Auth configuration, admin login, sessions, RBAC permissions, route guards, admin gate/proxy behavior, audit logging, or permission-sensitive Server Actions. Do not use for unrelated public UI changes.
---

# Auth RBAC Change

## Workflow

1. Identify the boundary: public auth flow, admin login, session lookup, permission check, route guard, API route, or audited mutation.
2. Keep Better Auth configuration centralized and use `prismaAdapter(basePrisma)` with explicit `baseURL` and UUID ids.
3. Route admin write Server Actions through `executeAdminMutationResult`.
4. Use `checkPermission()` directly only in API Routes or established boundary code.
5. Preserve audit coverage with `logAction()` for permission-sensitive operations.
6. Validate all form and external inputs with Zod before auth or RBAC decisions use them.
7. Add focused tests for the guard, permission, action, or proxy behavior being changed.

## Guardrails

- Do not bypass RBAC with ad-hoc role checks in feature code.
- Do not leak auth errors that reveal account existence or permission internals.
- Do not change session cookie, OAuth, or redirect behavior without testing login and admin access.
- Do not add compatibility paths for retired permission names unless the user explicitly asks for a migration period.

## Validation

- Admin gate scope: `bun test __tests__/unit/proxy-admin-gate.test.ts`.
- Permission/action scope: run the nearest unit or integration test for the changed action.
- Minimum completion gate: `bun run validate`.
- Before PR / release / commit: `bun run validate && bun run build`.
