# IAP Staff RBAC Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align staff management, system settings, and RBAC UI with the IAP-only admin model.

**Architecture:** Google Cloud IAP remains the only admin entry authentication layer. The app trusts only verified IAP identity, then applies local staff records and RBAC for authorization. Staff management handles only dashboard roles and does not create credentials, login tokens, or public users.

**Tech Stack:** Next.js App Router, React Server Components, Server Actions, Prisma domain modules, Bun tests, Google Cloud IAP signed headers.

---

### Task 1: Staff Domain Query Boundary

**Files:**

- Modify: `src/shared/domain/users/queries.ts`
- Modify: `src/shared/domain/users/types.ts`
- Test: `__tests__/unit/domain/users/queries.test.ts`

- [x] Add a dashboard-role filter to every staff list/detail/stat query so `USER` and `CUSTOMER` never appear in staff management.
- [x] Rename staff stat fields to `total`, `superAdmins`, `admins`, `editors`, `viewers`, and `recentStaff`.
- [x] Add unit coverage proving list/detail/stat queries always constrain roles to dashboard staff roles.

### Task 2: Staff Mutation Boundary

**Files:**

- Modify: `src/shared/lib/admin-roles.ts`
- Modify: `src/shared/lib/validations/user.ts`
- Modify: `src/shared/domain/users/commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/user.ts`
- Test: `__tests__/unit/lib/admin-roles.test.ts`
- Test: `__tests__/unit/lib/validations/user.test.ts`
- Test: `__tests__/unit/domain/users/commands.test.ts`
- Test: `__tests__/integration/actions/admin/user.action-shape.test.ts`

- [x] Introduce assignable staff roles as `ADMIN`, `EDITOR`, and `VIEWER`.
- [x] Reject `SUPER_ADMIN`, `USER`, and `CUSTOMER` in staff create/update schemas.
- [x] Remove the standalone `updateUserRole` action and command because role updates are handled through the staff edit form under the same hierarchy checks.
- [x] Preserve lockout protection by keeping self-delete prevention and keeping `SUPER_ADMIN` creation outside the staff UI.

### Task 3: Staff Management UI

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/new/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/[id]/edit/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffStats.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/UserActions.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/UserForm.tsx`

- [x] Require `user:read`, `user:create`, or `user:update` at page entry points before reading staff data.
- [x] Hide add/edit/delete controls unless the current user has the matching RBAC permission and hierarchy permission.
- [x] Remove the legacy `ADMIN` to `USER` role toggle dialog.
- [x] Replace email verification display with IAP access guidance.

### Task 4: System Permissions UI

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/system/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/PermissionsSection.tsx`

- [x] Make the permissions view describe the three gates: IAP Google Group, app staff record, app role.
- [x] Make `SUPER_ADMIN`-only capabilities visually explicit without adding new color tokens.
- [x] Gate sensitive settings pages, categories, integration health, and secret/OAuth actions with `settings:manage`.

### Task 5: Verification

**Commands:**

- `bun scripts/run-tests.ts __tests__/unit/lib/admin-roles.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/lib/validations/user.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/domain/users/commands.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/domain/users/queries.test.ts`
- `bun scripts/run-tests.ts __tests__/integration/actions/admin/user.action-shape.test.ts`
- `bun scripts/run-tests.ts __tests__/integration/actions/admin/google-business-profile.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/api/google-business-profile-oauth-callback.test.ts`
- `bun scripts/run-tests.ts __tests__/unit/architecture/admin-settings-permissions.test.ts`
- `bun test __tests__/unit/architecture/admin-design-tokens.test.ts`
- `bun test __tests__/unit/architecture/admin-submit-button-pattern.test.ts`
- `bun run type-check`

Expected result: all commands pass. Any failure must be fixed before commit.
