# IAP-only Admin Auth Design

## Goal

Build the admin authentication model around Google Cloud IAP as the only admin
entry point. The result must be high-security, simple to operate, easy for
staff to understand, and visually clear in the admin UI.

## Official Basis

- Cloud Run admin service is protected with direct IAP.
- IAP access is granted with `roles/iap.httpsResourceAccessor`.
- Staff access is managed through Google accounts, preferably through a Google
  group bound to the IAP-secured admin Cloud Run service.
- The application trusts IAP identity only after verifying the signed
  `x-goog-iap-jwt-assertion` header.
- Next.js App Router server code reads IAP headers with `headers()` at request
  time.
- Better Auth email/password remains for public customer authentication only.
  It is removed from the admin surface.

References:

- https://cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run
- https://cloud.google.com/iam/docs/roles-permissions/iap
- https://cloud.google.com/iap/docs/signed-headers-howto
- https://cloud.google.com/iam/docs/groups-in-cloud-console
- https://nextjs.org/docs/app/api-reference/functions/headers
- https://www.better-auth.com/docs/authentication/email-password

## Final User Flow

All admins and staff use the same admin URL.

```text
Open admin URL
-> Google Cloud IAP authenticates the Google account
-> Application verifies the signed IAP JWT
-> Application finds a User by the IAP email address
-> Dashboard role check allows SUPER_ADMIN, ADMIN, EDITOR, or VIEWER
-> Admin dashboard opens
```

The URL is not personalized. Identity and authorization are determined by the
Google account and the database role.

## Access Rules

| IAP access | DB staff user          | Result                    |
| ---------- | ---------------------- | ------------------------- |
| Allowed    | Dashboard role exists  | Admin dashboard opens     |
| Allowed    | No matching staff user | Access-denied page        |
| Denied     | Any DB state           | IAP blocks before the app |
| Denied     | No DB user             | IAP blocks before the app |

The application never offers a public admin self-registration path.

## Admin UX

Admin authentication UI must be minimal:

- No admin email/password login form.
- No admin password reset page.
- No admin setup token page.
- No app password fields in staff create/edit forms.
- A clear access-denied page explains that the signed-in Google account is not
  registered as staff and that the user must contact an administrator.
- Staff list, detail, and edit screens show email, name, and role.
- The staff creation screen says that Google/IAP is used for login and no app
  password is required.
- The staff email action sends an access guide, not an authentication token.

## Staff Invitation Replacement

The old token-based staff invitation model is removed.

The replacement is a staff access guide email:

- Sent by an authorized admin from the staff screen.
- Uses the shared admin URL from `ADMIN_APP_URL`.
- Includes staff email address and role.
- States that the staff member signs in with their Google account through IAP.
- States that no app-specific password is required.
- Provides a short troubleshooting note: if access is denied, ask an
  administrator to confirm both IAP access and staff registration.

This email is informational only. It grants no access by itself.

## Data Model

Keep:

- `User`
- `Role`
- `Session` and `Account` for customer Better Auth compatibility
- RBAC helpers and permission matrix

Remove:

- `StaffInvitation` model
- `staff_invitations` table
- token, expiry, usedAt, resend, and setup-password logic

Admin staff users are stored as `User` rows with dashboard roles. Admin staff
users do not need a `credential` account row.

## Initial Admin

Do not hard-code production admin credentials in source.

Production bootstrap uses environment-provided identity:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_NAME`

The bootstrap operation is idempotent:

- If no `SUPER_ADMIN` exists, create one with the initial email.
- If that email exists, ensure it has `SUPER_ADMIN`.
- Do not create a password.
- Do not create a credential account.

The same Google account must also be allowed by IAP, preferably through the
admin Google group.

## Admin Auth Boundary

Create a server-only IAP auth module responsible for:

- Reading `x-goog-iap-jwt-assertion`.
- Verifying the JWT signature and claims.
- Extracting the authenticated email.
- Normalizing the email to match `User.email`.
- Loading the live database user and role.
- Returning the current admin user or redirecting to access denied.

The proxy remains DB-free. It must not perform staff lookup. It continues to
block admin routes on the public Cloud Run surface.

## Removed Routes

Remove these admin routes:

- `/admin/login`
- `/admin/forgot-password`
- `/admin/reset-password`
- `/admin/setup/[token]`
- `/api/auth/[...all]` for admin Better Auth

For clean break behavior:

- Public service still returns 404 for `/admin/*`.
- Admin service redirects `/admin/login` to `/admin`.
- Removed auth/setup pages return the admin not-found page or redirect to
  `/admin` where appropriate.

## Admin Logout

There is no app-session logout for admin after IAP-only migration.

The admin header action becomes one of:

- Link to the shared admin URL/home, or
- Link/button labeled "Googleアカウントを切り替え" that points to a documented
  IAP/Google sign-out or account-switching URL if a reliable URL is confirmed
  during implementation.

If no reliable IAP sign-out URL is available, the app must avoid a fake logout
button.

## Security Properties

This design removes:

- Admin credential stuffing surface.
- Admin password storage and reset flow.
- Admin setup token leakage risk.
- Publicly useful admin registration links.
- App-level admin login rate-limit complexity.

It keeps:

- IAP as the outer gate.
- DB role checks as the inner authorization layer.
- Live DB authorization for role changes and deleted staff.
- Public/admin Cloud Run surface separation.
- Audit logging for admin mutations.

## Test Strategy

Unit tests:

- IAP JWT verifier accepts valid claims and rejects missing, malformed, expired,
  wrong issuer, wrong audience, and missing email claims.
- Admin auth helper returns the matching dashboard user.
- Admin auth helper denies missing DB users and non-dashboard roles.
- Staff create/update validation has no password field.
- Staff access guide email renders admin URL, email, role, and no password/setup
  language.
- Proxy tests assert public `/admin/*` remains 404 and admin `/admin/login`
  no longer depends on an admin-auth session cookie.

Integration/action tests:

- Staff creation creates `User` only, without credential account creation.
- Staff access guide email can be sent for an existing staff user.
- Role changes still preserve last `SUPER_ADMIN` protection.

Architecture tests:

- No imports of admin Better Auth client in admin dashboard code.
- No admin password/setup routes remain.
- No `StaffInvitation` model/domain/action references remain outside migration
  history.

E2E/smoke:

- Local E2E uses a controlled test-mode IAP identity header, enabled only by an
  explicit test env flag.
- Production behavior relies on real IAP and does not accept unsigned identity
  headers.

## Migration

Add a new Prisma migration that drops the `staff_invitations` table.

Do not edit existing migrations.

Existing admin `User` rows remain. Existing credential account rows can remain
temporarily because the customer auth tables are still valid and deletion is not
required for correctness. New admin staff creation must stop creating
credential accounts.

## Deployment Notes

Cloud Build already deploys the admin Cloud Run service with `--iap` and
`--no-allow-unauthenticated`.

Production requires:

- `APP_SURFACE=admin` on the admin service.
- `ADMIN_APP_URL` set to the shared admin URL.
- IAP access granted to the admin Google group or approved users.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_NAME` configured for bootstrap.

## Out Of Scope

- Replacing public customer authentication.
- Building a Google group management UI inside the app.
- Synchronizing Google group membership into the application database.
- Supporting non-IAP admin login as a fallback.
