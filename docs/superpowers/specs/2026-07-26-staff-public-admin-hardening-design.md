# Staff + Public/Admin Page Hardening (Clean Break)

Date: 2026-07-26  
Status: approved by implement directive (recommended options)

## Goals

Close audit holes in staff management and public↔admin page coupling with
official-aligned, no-shim clean-break changes.

## Decisions

1. **Staff identity SSoT remains Google Workspace groups.** No in-app
   create/edit/delete for staff users. `/admin/staff/new` and `.../edit` stay
   redirects (or become gone routes with correct metadata later).
2. **Offboarding = dashboard disable, not role wipe.** Add
   `User.dashboardEnabled Boolean @default(true)`.
   - Group match → sync role + `dashboardEnabled=true`.
   - No unique group match for an existing dashboard user →
     `dashboardEnabled=false` (role retained for audit).
   - Login / sync return null when `dashboardEnabled=false`.
   - Notification candidates + inquiry assignable staff exclude disabled.
   - Staff list/detail still show disabled users (badge).
3. **Last-admin protection.** Refuse any sync that would leave zero
   `dashboardEnabled` users with role in `{SUPER_ADMIN, ADMIN}`. Keep prior
   state; write HIGH audit/error log.
4. **UserPageAssignment is first-class admin UX.** Domain
   `setAssignedPageIdsForUser` + staff detail section (ADMIN+ only). Seed is
   no longer the only write path. Permissions copy must match reality.
5. **notificationStaffIds** validated server-side to existing
   `dashboardEnabled` dashboard-role users only.
6. **Page preview drafts:** only roles with `page:update` or `page:publish`
   may preview unpublished pages; EDITOR still needs assignment.
7. **ensureSystemPageCommand** runs on system page edit entry.
8. **bulk publish** returns actual updated count (system pages excluded).
9. **P2002** on first-login create: catch, re-read, continue.
10. **Copy cleanup:** remove “add from staff management” / false EDITOR
    post·news capabilities; point to Google Admin for staff lifecycle.

## Non-goals

- App-side staff invite/password flows
- Redis / distributed anything
- Changing IAP itself
- Nested custom page URLs

## PR split

| PR  | Scope                                                                                         |
| --- | --------------------------------------------------------------------------------------------- |
| A   | Schema `dashboardEnabled` + Google sync revoke/re-enable + last-admin + P2002 + query filters |
| B   | UserPageAssignment commands + staff detail UI + PermissionsSection alignment                  |
| C   | notificationStaffIds validation + picker/empty-state copy                                     |
| D   | Preview draft gate + bulk publish count + ensureSystemPage wiring                             |

## Risks

- Additive column only → no planned downtime.
- Existing rows default `true` (safe).
- Disabled users remain FK targets (assignee history ok); active pickers exclude them.
