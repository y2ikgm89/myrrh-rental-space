# Admin access operations

This is the day-to-day operating runbook for Myrrh Rental Space admin access.
The build and GCP setup details live in `docs/gcp-production-setup.md`; this
file is only for adding, removing, and verifying people.

Last target update: 2026-07-05.
Last live verification: 2026-07-05, after the admin custom-domain cutover.

Official references specific to this runbook (Cloud Run / IAP / Cloud Identity
の基盤側 reference は [`gcp-production-setup.md`](gcp-production-setup.md) が持つ):

- IAP signed headers:
  <https://cloud.google.com/iap/docs/signed-headers-howto>
- Google Groups IAM best practices:
  <https://cloud.google.com/iam/docs/groups-best-practices>
- Google Admin 2-Step Verification:
  <https://support.google.com/a/answer/175197>

## Current production contract

Admin access has three gates. A user must pass all of them:

1. Google account authentication through Cloud Run direct IAP.
2. Membership in exactly one admin role Google Group.
3. Automatic app staff synchronization from that Google Group role.

The public site and the admin site are intentionally separate:

- Public site: <https://rental-space.myrrh-jp.com/>
- Public `/admin`: must return 404.
- Admin site: <https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app/>
- Admin `/admin`: must redirect unauthenticated visitors to Google/IAP.

There is no public admin registration page, no app password login, and no
per-user login token URL. Staff receive the same admin URL. Access and role
assignment are controlled by Google/Cloud Identity group membership.

## Identities and groups

Use these groups for different purposes:

| Group                             | Purpose                           | Who belongs here                                  |
| --------------------------------- | --------------------------------- | ------------------------------------------------- |
| `myrrh-super-admins@myrrh-jp.com` | Super admin app role + IAP access | Owner-level administrators only                   |
| `myrrh-admins@myrrh-jp.com`       | Admin app role + IAP access       | Daily operations administrators                   |
| `myrrh-editors@myrrh-jp.com`      | Editor app role + IAP access      | Content editors                                   |
| `myrrh-viewers@myrrh-jp.com`      | Viewer app role + IAP access      | Read-only staff                                   |
| `myrrh-gcp-admins@myrrh-jp.com`   | GCP control plane administration  | Only people who administer Google Cloud resources |

Do not add normal staff to `myrrh-gcp-admins@myrrh-jp.com`.
Do not put one person in more than one admin role group. The app rejects
ambiguous multi-role membership.

Default staff identity policy:

- use a managed Cloud Identity account under `myrrh-jp.com`;
- require 2-Step Verification before adding the user to
  an admin role group;
- do not use personal Gmail, Yahoo, or other private mailboxes for normal staff
  access;
- do not grant `roles/iap.httpsResourceAccessor` to `user:*`,
  `allUsers`, or `allAuthenticatedUsers` in production.

## Add a staff member

1. Create the staff Google account in Google Admin for `myrrh-jp.com`, or
   confirm that the managed account already exists.
2. Confirm 2-Step Verification is enrolled or enforced for the account.
3. Add the Google account to exactly one admin role group:
   `myrrh-super-admins@myrrh-jp.com`, `myrrh-admins@myrrh-jp.com`,
   `myrrh-editors@myrrh-jp.com`, or `myrrh-viewers@myrrh-jp.com`.
4. Send the common admin URL to the user.
5. Ask the user to open the admin URL. On first access, the app creates or
   updates the local staff record from Google Group membership.
6. **Editor の場合のみ** — 本人が 1 度アクセスしてレコードができた後に
   `/admin/staff/{id}` を開き、編集を許可するページを割り当てる。割り当てが 0 件の
   editor はログインとメディアアップロードはできるが、どのページも編集できない。

アクセス権そのものは app から作れない（グループ所属が正）。ただし staff 詳細
ページは上記のページ割り当てという**書き込み UI** を持つので、「同期された閲覧
専用ビュー」ではない。

## Remove a staff member

Remove access in this order:

1. Remove the account from all admin role groups.
2. Suspend or delete the Cloud Identity user in Google Admin when the account is
   no longer needed.
3. If the person also administered GCP, remove them from
   `myrrh-gcp-admins@myrrh-jp.com`.
4. Run the production audit.

Group removal is first because IAP blocks the request before the app runs.

What the app then does with the local staff record:

- **Offboarding disables the dashboard; it does not wipe the role.** When the
  app syncs an existing dashboard user and no admin role group matches, it sets
  `User.dashboardEnabled` to `false` and keeps the previous role for audit
  history (`revokeDashboardAccess` in
  `src/shared/domain/admin-auth/google-role-sync.ts`; it only fires when the
  stored role is a dashboard role). Login and sync then resolve to nothing, but
  the staff list and detail keep showing the person with a disabled badge — a
  removed account is **expected** to stay in the list. Assignment pickers do
  exclude it: notification recipients (`src/shared/domain/users/queries.ts`) and
  inquiry assignees (`src/shared/domain/inquiries/queries.ts`) both filter
  `dashboardEnabled: true`.
- **The sync only runs on the person's own admin request.** Removing the group
  membership does not flip the local record right away — nothing re-reads
  Google Groups until that account hits an admin route again. IAP already
  refuses the request, so access stops immediately; only the staff-list display
  lags.
- **Last admin is protected.** A sync that would leave zero `dashboardEnabled`
  users with `SUPER_ADMIN` or `ADMIN` is refused, the prior state is kept, and a
  HIGH-severity audit/error log is written. Add the replacement admin **before**
  removing the last one.

## Change an email address

Email changes cross both identity systems. Treat them as remove-and-add:

1. Add the new managed Google account.
2. Enforce or confirm 2-Step Verification.
3. Add the new account to exactly one admin role group.
4. Confirm the new account can open the dashboard.
5. Remove the old account from all admin role groups.
6. Suspend or delete the old Cloud Identity account if it should no longer
   exist.

## Verify production access

Use PowerShell from this repository:

```powershell
curl.exe -I "https://rental-space.myrrh-jp.com/admin"
curl.exe -I "https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app/"
curl.exe -I "https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app/admin"
```

Expected result:

- public `/admin` returns 404;
- admin `/` and `/admin` return a redirect to Google/IAP when unauthenticated.

If the admin page shows "Google IAP authenticated" but "no admin role", IAP
has already allowed the Google account. Check Cloud Identity next:

- the account must be in exactly one of the four admin role groups;
- remove the account from every other admin role group before retrying;
- if the browser has multiple Google accounts signed in, retry with
  `?gcp-iap-mode=CLEAR_LOGIN_COOKIE` and choose the managed account.

Run the GCP posture audit:

```powershell
# Optional when Google Cloud CLI is installed but the gcloud executable is not on PATH.
$env:GCLOUD_BIN = "$env:LOCALAPPDATA\google-cloud-sdk\bin\gcloud.cmd"
$env:GCP_PROJECT_ID = "myrrh-rental-space"
$env:GCP_ORGANIZATION_ID = "844678510879"
$env:CLOUD_IDENTITY_DOMAIN = "myrrh-jp.com"
$env:REGION = "asia-northeast1"
$env:SERVICE_NAME = "myrrh-rental-space"
$env:ADMIN_SERVICE_NAME = "myrrh-rental-space-admin"
$env:MIGRATE_JOB_NAME = "prisma-migrate"
$env:AR_REPOSITORY = "myrrh-rental-space"
$env:PUBLIC_DOMAIN = "https://rental-space.myrrh-jp.com"
$env:ADMIN_DOMAIN = "https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app"
$env:ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL = "myrrh-super-admins@myrrh-jp.com"
$env:ADMIN_ROLE_GROUP_ADMIN_EMAIL = "myrrh-admins@myrrh-jp.com"
$env:ADMIN_ROLE_GROUP_EDITOR_EMAIL = "myrrh-editors@myrrh-jp.com"
$env:ADMIN_ROLE_GROUP_VIEWER_EMAIL = "myrrh-viewers@myrrh-jp.com"
$env:RUNTIME_SERVICE_ACCOUNT = "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com"
$env:BUILD_SERVICE_ACCOUNT = "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com"
$env:CRON_SERVICE_ACCOUNT_EMAIL = "myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com"
$env:GITHUB_REPOSITORY = "y2ikgm89/myrrh-rental-space"
$env:GITHUB_REPOSITORY_ID = "1128842422"
$env:GITHUB_REPOSITORY_OWNER_ID = "69025248"
$env:WIF_POOL_ID = "github-actions"
$env:WIF_PROVIDER_ID = "github-myrrh-rental-space"
bun run gcp:audit-production-iap
```

The audit must pass before considering the admin posture clean.
It reads Cloud Run IAP access through the official IAP REST API and does not depend on local `gcloud iap web --resource-type=cloud-run` support.

## Emergency checks

If a staff member sees Google access denied:

1. Confirm the signed-in Google account is the intended managed account.
2. Confirm the account is a member of exactly one admin role group.
3. Confirm the role group is granted `roles/iap.httpsResourceAccessor`.
4. Confirm the app synced staff record after the user's next successful access.

If public `/admin` does not return 404:

1. Stop treating the deployment as clean.
2. Check that the public Cloud Run service uses `APP_SURFACE=public`.
3. Check that the admin service uses `APP_SURFACE=admin` and IAP.
4. Run `bun run gcp:audit-production-iap`.

If the audit reports individual or public IAP access:

1. Remove `user:*`, `allUsers`, and `allAuthenticatedUsers` from the admin IAP
   policy.
2. Confirm only the four admin role groups have
   `roles/iap.httpsResourceAccessor` for the admin service.
3. Run the audit again.

## What not to add back

Do not reintroduce any of these:

- public admin registration;
- app email/password login for admin;
- login token URL issuance for staff;
- app-side staff invite, role assignment, or password setup as the source of
  admin access;
- individual IAP user grants in production;
- personal mailbox staff access as the default path;
- shared passwords or secrets in documentation.
