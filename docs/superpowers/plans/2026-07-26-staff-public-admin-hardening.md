# Staff + Public/Admin Hardening Implementation Plan

> **For agentic workers:** Implement PR A→D in order when files overlap; B/C/D may parallelize after A lands if branched from A tip. TDD where practical.

**Goal:** Clean-break fix of staff offboarding, EDITOR page assignment, notification staff validation, and public↔admin page preview/publish gaps.

**Architecture:** Google groups remain SSoT for role; `User.dashboardEnabled` gates dashboard access; `UserPageAssignment` gains real admin mutations; preview/publish hardenings stay on existing page domain.

**Tech stack:** Prisma 7, Next.js App Router, Bun tests via `scripts/run-tests.ts`.

---

## PR A — dashboardEnabled + Google sync

### Task A1: Schema

- Add `dashboardEnabled Boolean @default(true)` on `User` in `prisma/schema.prisma`
- `bun run db:migrate --name user_dashboard_enabled`
- `bun run db:generate`
- Update `AdminAuthUser` / `UserData` types to include field where needed

### Task A2: Sync behavior

File: `src/shared/domain/admin-auth/google-role-sync.ts`

- Existing user + `role === null` → attempt `dashboardEnabled=false` unless last-admin guard trips
- Successful role match → set role + `dashboardEnabled=true`
- Create path: catch P2002, re-fetch, apply update path
- Return null when disabled after sync

### Task A3: Consumers

- `findAdminAuthUserByEmail` / login path reject `dashboardEnabled=false`
- `getNotificationStaffCandidates`, `listAssignableStaff` filter enabled
- Staff list/detail expose enabled state + badge
- Tests for revoke, re-enable, last-admin, P2002

---

## PR B — UserPageAssignment

- `src/shared/domain/user-page-assignments/commands.ts` — replace-all pageIds for EDITOR users
- Admin action under `user:update` + resource checks
- Staff detail section UI (checkbox list of pages)
- Fix PermissionsSection copy
- Unit + action-shape tests

---

## PR C — notificationStaffIds

- Validate IDs ⊆ enabled dashboard staff in settings command/schema
- Fix NotificationStaffPicker empty copy (Google Admin)
- Fix EDITOR capabilities list (no post/news)

---

## PR D — pages preview/publish

- Preview: unpublished requires `page:update` or `page:publish` (+ EDITOR assignment)
- `ensureSystemPageCommand` on system edit entry
- bulk publish return actual count
- Tests

---

## Verification

```sh
bun run validate
bun scripts/run-tests.ts __tests__/unit/domain/admin-auth
bun scripts/run-tests.ts __tests__/unit/domain/user-page-assignments
bun scripts/run-tests.ts __tests__/unit/domain/users
bun scripts/run-tests.ts __tests__/unit/domain/pages
bun run build
```
