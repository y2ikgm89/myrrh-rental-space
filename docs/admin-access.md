# Admin access operations

This is the day-to-day operating runbook for Myrrh Rental Space admin access.
The build and GCP setup details live in `docs/gcp-production-setup.md`; this
file is only for adding, removing, and verifying people.

Last verified: 2026-07-01.

Official references checked for this runbook:

- Cloud Run direct IAP:
  <https://cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run>
- IAP access management:
  <https://cloud.google.com/iap/docs/managing-access>
- IAP signed headers:
  <https://cloud.google.com/iap/docs/signed-headers-howto>
- Google Groups IAM best practices:
  <https://cloud.google.com/iam/docs/groups-best-practices>
- Cloud Identity groups:
  <https://cloud.google.com/identity/docs/groups>
- Google Admin 2-Step Verification:
  <https://support.google.com/a/answer/175197>

## Current production contract

Admin access has three gates. A user must pass all of them:

1. Google account authentication through Cloud Run direct IAP.
2. Membership in the IAP access group `myrrh-admins@myrrh-jp.com`.
3. A matching active app staff user with a dashboard role.

The public site and the admin site are intentionally separate:

- Public site: <https://rental-space.myrrh-jp.com/>
- Public `/admin`: must return 404.
- Admin site: <https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin>
- Admin `/admin`: must redirect unauthenticated visitors to Google/IAP.

There is no public admin registration page, no app password login, and no
per-user login token URL. Staff receive the same admin URL. Access is controlled
by Google/Cloud Identity group membership plus the app staff record.

## Identities and groups

Use these groups for different purposes:

| Group                           | Purpose                          | Who belongs here                                  |
| ------------------------------- | -------------------------------- | ------------------------------------------------- |
| `myrrh-admins@myrrh-jp.com`     | IAP access to the admin site     | Staff who should open the admin dashboard         |
| `myrrh-gcp-admins@myrrh-jp.com` | GCP control plane administration | Only people who administer Google Cloud resources |

Do not add normal staff to `myrrh-gcp-admins@myrrh-jp.com`.

Default staff identity policy:

- use a managed Cloud Identity account under `myrrh-jp.com`;
- require 2-Step Verification before adding the user to
  `myrrh-admins@myrrh-jp.com`;
- do not use personal Gmail, Yahoo, or other private mailboxes for normal staff
  access;
- do not grant `roles/iap.httpsResourceAccessor` to `user:*`,
  `allUsers`, or `allAuthenticatedUsers` in production.

## Add a staff member

1. Create the staff Google account in Google Admin for `myrrh-jp.com`, or
   confirm that the managed account already exists.
2. Confirm 2-Step Verification is enrolled or enforced for the account.
3. Add the Google account to `myrrh-admins@myrrh-jp.com`.
4. In the admin dashboard, create the app staff user with the same email
   address and the least privileged role that fits the work:
   `ADMIN`, `EDITOR`, or `VIEWER`.
5. Let the app send the staff access guide email. The email contains the common
   admin URL and states that the user signs in with Google/IAP.
6. Ask the user to open the admin URL. If they reach the dashboard, the three
   gates are consistent.

`SUPER_ADMIN` is bootstrap-only. Do not create new `SUPER_ADMIN` users from the
staff management UI.

## Remove a staff member

Remove access in this order:

1. Remove the account from `myrrh-admins@myrrh-jp.com`.
2. Suspend or delete the Cloud Identity user in Google Admin when the account is
   no longer needed.
3. Delete or disable the matching app staff user.
4. If the person also administered GCP, remove them from
   `myrrh-gcp-admins@myrrh-jp.com`.
5. Run the production audit.

Group removal is first because IAP blocks the request before the app runs.

## Change an email address

Email changes cross both identity systems. Treat them as remove-and-add:

1. Add the new managed Google account.
2. Enforce or confirm 2-Step Verification.
3. Add the new account to `myrrh-admins@myrrh-jp.com`.
4. Update the app staff user's email to the same new address.
5. Confirm the new account can open the dashboard.
6. Remove the old account from `myrrh-admins@myrrh-jp.com`.
7. Suspend or delete the old Cloud Identity account if it should no longer
   exist.

## Verify production access

Use PowerShell from this repository:

```powershell
curl.exe -I "https://rental-space.myrrh-jp.com/admin"
curl.exe -I "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin"
```

Expected result:

- public `/admin` returns 404;
- admin `/admin` returns a redirect to Google/IAP when unauthenticated.

Run the GCP posture audit:

```powershell
$env:GCP_PROJECT_ID = "myrrh-rental-space"
$env:GCP_ORGANIZATION_ID = "844678510879"
$env:CLOUD_IDENTITY_DOMAIN = "myrrh-jp.com"
$env:REGION = "asia-northeast1"
$env:SERVICE_NAME = "myrrh-rental-space"
$env:ADMIN_SERVICE_NAME = "myrrh-rental-space-admin"
$env:IAP_ADMIN_GROUP = "group:myrrh-admins@myrrh-jp.com"
$env:BUILD_SERVICE_ACCOUNT = "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com"
$env:GITHUB_REPOSITORY_ID = "1128842422"
$env:WIF_POOL_ID = "github-actions"
$env:WIF_PROVIDER_ID = "github-myrrh-rental-space"
bun run gcp:audit-production-iap
```

The audit must pass before considering the admin posture clean.

## Emergency checks

If a staff member sees Google access denied:

1. Confirm the signed-in Google account is the intended managed account.
2. Confirm the account is a member of `myrrh-admins@myrrh-jp.com`.
3. Confirm the app staff user exists with the same email address.
4. Confirm the staff role is one of `ADMIN`, `EDITOR`, or `VIEWER`.

If public `/admin` does not return 404:

1. Stop treating the deployment as clean.
2. Check that the public Cloud Run service uses `APP_SURFACE=public`.
3. Check that the admin service uses `APP_SURFACE=admin` and IAP.
4. Run `bun run gcp:audit-production-iap`.

If the audit reports individual or public IAP access:

1. Remove `user:*`, `allUsers`, and `allAuthenticatedUsers` from the admin IAP
   policy.
2. Confirm only `group:myrrh-admins@myrrh-jp.com` has
   `roles/iap.httpsResourceAccessor` for the admin service.
3. Run the audit again.

## What not to add back

Do not reintroduce any of these:

- public admin registration;
- app email/password login for admin;
- login token URL issuance for staff;
- individual IAP user grants in production;
- personal mailbox staff access as the default path;
- shared passwords or secrets in documentation.
