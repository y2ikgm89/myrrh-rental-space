# GCP production setup

This document is the production setup runbook for Myrrh Rental Space on Google
Cloud. It follows the current Google Cloud recommendations that matter for this
repository:

- use user-managed service accounts instead of default service accounts;
- store secrets in Secret Manager and grant access only to the runtime identity;
- deploy containers to Cloud Run from Artifact Registry;
- run Prisma migrations as a Cloud Run Job before deploying the web service;
- protect admin traffic with Identity-Aware Proxy (IAP) and Google accounts;
- run the production project under a Google Cloud Organization backed by Cloud
  Identity or Google Workspace;
- keep public pages reachable while admin routes are isolated on a separate
  IAP-protected Cloud Run service.

Official references:

- Cloud Run IAP:
  <https://cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run>
- Cloud Run ingress:
  <https://cloud.google.com/run/docs/securing/ingress>
- Cloud Run custom domains:
  <https://cloud.google.com/run/docs/mapping-custom-domains>
- External Application Load Balancer with Cloud Run:
  <https://cloud.google.com/load-balancing/docs/https/setup-global-ext-https-serverless>
- Cloud Run secrets:
  <https://cloud.google.com/run/docs/configuring/services/secrets>
- Cloud Run service identity:
  <https://cloud.google.com/run/docs/configuring/services/service-identity>
- Cloud Build deploy to Cloud Run:
  <https://cloud.google.com/build/docs/deploying-builds/deploy-cloud-run>
- Cloud Build user-specified service accounts:
  <https://cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts>
- Cloud Build locations:
  <https://cloud.google.com/build/docs/locations>
- Google Cloud Workload Identity Federation for deployment pipelines:
  <https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines>
- google-github-actions/auth:
  <https://github.com/google-github-actions/auth>
- google-github-actions/setup-gcloud:
  <https://github.com/google-github-actions/setup-gcloud>
- IAP IAM:
  <https://cloud.google.com/iap/docs/managing-access>
- Google Cloud resource hierarchy:
  <https://cloud.google.com/resource-manager/docs/cloud-platform-resource-hierarchy>
- Cloud Identity groups:
  <https://cloud.google.com/identity/docs/groups>
- Cloud Identity Groups API setup:
  <https://cloud.google.com/identity/docs/how-to/setup>
- Service account key best practices:
  <https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys>
- gcloud run jobs update:
  <https://cloud.google.com/sdk/gcloud/reference/run/jobs/update>
- gcloud artifacts repositories get-iam-policy:
  <https://cloud.google.com/sdk/gcloud/reference/artifacts/repositories/get-iam-policy>
- gcloud run services get-iam-policy:
  <https://cloud.google.com/sdk/gcloud/reference/run/services/get-iam-policy>
- gcloud run jobs get-iam-policy:
  <https://cloud.google.com/sdk/gcloud/reference/run/jobs/get-iam-policy>
- gcloud iam service-accounts get-iam-policy:
  <https://cloud.google.com/sdk/gcloud/reference/iam/service-accounts/get-iam-policy>
- gcloud storage buckets get-iam-policy:
  <https://cloud.google.com/sdk/gcloud/reference/storage/buckets/get-iam-policy>

Legacy Cloud Build cleanup reference, for auditing or deleting leftovers only:

- Cloud Build triggers:
  <https://cloud.google.com/build/docs/automating-builds/create-manage-triggers>

## Target architecture

Cloud Run service-level IAP protects an entire service. Do not enable IAP on
the public service. The clean production target is:

- one public Cloud Run service for public routes, deployed with
  `APP_SURFACE=public` and `--allow-unauthenticated`;
- one admin Cloud Run service for admin routes, deployed with
  `APP_SURFACE=admin`, with authenticated-only access and Cloud Run direct IAP
  enabled once during setup;
- one global external HTTPS Application Load Balancer that maps
  `https://admin.myrrh-jp.com` to the admin Cloud Run service. Do not enable
  IAP on the load balancer backend; Cloud Run direct IAP remains the single IAP
  enforcement point for the admin service;
- Google Workspace / Cloud Identity security groups for admin roles, each
  granted `roles/iap.httpsResourceAccessor` for admin access and used as the
  application role source;
- no individual user grants on the IAP-secured admin resource.

For production, do not treat an orgless Google Cloud project as the final
state. Google Cloud Run direct IAP can protect an orgless project after the
required console OAuth setup, but this repository's production baseline is
stricter: the final admin site must run in a project under the configured
Google Cloud Organization. An orgless project is only a temporary bootstrap
environment.

Production host/path layout:

- `https://rental-space.myrrh-jp.com/*` -> public service
- `https://admin.myrrh-jp.com/` -> admin service with IAP, then app redirect
  to `/admin`
- `https://admin.myrrh-jp.com/admin` -> admin
  service with IAP
- `https://admin.myrrh-jp.com/admin/*` -> admin
  service with IAP
- `https://admin.myrrh-jp.com/admin/api/*` ->
  admin service with IAP
- `https://admin.myrrh-jp.com/api/instagram/oauth/*`
  -> admin service with IAP
- `https://admin.myrrh-jp.com/api/google-business-profile/oauth/*`
  -> admin service with IAP
- `https://admin.myrrh-jp.com/preview/*` -> admin
  service with IAP

Direct admin `run.app` URLs are not part of the production contract. The admin
Cloud Run service must use `--ingress=internal-and-cloud-load-balancing` and
`--no-default-url`, so internet traffic reaches it only through the admin load
balancer and then through Cloud Run direct IAP. If a same-domain public
`/admin` path is required later, treat that as a new URL/IAP design and update
the load balancer, deploy flags, audit model, and runbooks together.

Keep these public even in production:

- `/`
- `/spaces`, `/reservation`, `/contact`, `/blog`, `/news`, `/events`, `/faq`
- `/login`, `/mypage/*`
- `/api/customer-auth/*`
- `/api/webhooks/*`
- `/api/cron/*` (still protected by app-level cron auth)
- `/api/live`, `/api/health`
- `/sitemap.xml`, `/robots.txt`, `/feed.xml`, `/llms.txt`

## Required variables

Set these in your shell before running setup commands:

```bash
export PROJECT_ID="myrrh-rental-space"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export GCP_ORGANIZATION_ID="844678510879"
export CLOUD_IDENTITY_DOMAIN="myrrh-jp.com"
export REGION="asia-northeast1"
export SERVICE_NAME="myrrh-rental-space"
export ADMIN_SERVICE_NAME="myrrh-rental-space-admin"
export AR_REPOSITORY="myrrh-rental-space"
export PUBLIC_DOMAIN="https://rental-space.myrrh-jp.com"
export ADMIN_DOMAIN="https://admin.myrrh-jp.com"
export ADMIN_LB_IP="8.233.111.15"
export ADMIN_LB_IPV6="2600:1901:0:6b8e::"
export TURNSTILE_SITE_KEY="0x4AAAAAADi6Bqavj97fu7JG"
export MIGRATE_JOB_NAME="prisma-migrate"
export RUNTIME_SA="myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export BUILD_SA="myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"
export GITHUB_REPOSITORY="y2ikgm89/myrrh-rental-space"
export GITHUB_REPOSITORY_ID="1128842422"
export GITHUB_REPOSITORY_OWNER_ID="69025248"
export WIF_POOL_ID="github-actions"
export WIF_PROVIDER_ID="github-myrrh-rental-space"
export ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="myrrh-super-admins@myrrh-jp.com"
export ADMIN_ROLE_GROUP_ADMIN_EMAIL="myrrh-admins@myrrh-jp.com"
export ADMIN_ROLE_GROUP_EDITOR_EMAIL="myrrh-editors@myrrh-jp.com"
export ADMIN_ROLE_GROUP_VIEWER_EMAIL="myrrh-viewers@myrrh-jp.com"
export PRIMARY_ADMIN_EMAIL="admin@myrrh-jp.com"
export IAP_JWT_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${ADMIN_SERVICE_NAME}"
```

Use the official Cloud Build region inventory when auditing or removing legacy
Cloud Build triggers and repository connections. Native triggers can be
regional or global, and repository connections are regional:

```bash
CLOUD_BUILD_REGIONS=(
  africa-south1
  asia-east1
  asia-east2
  asia-northeast1
  asia-northeast2
  asia-northeast3
  asia-south1
  asia-south2
  asia-southeast1
  asia-southeast2
  asia-southeast3
  australia-southeast1
  australia-southeast2
  europe-central2
  europe-north1
  europe-north2
  europe-southwest1
  europe-west1
  europe-west2
  europe-west3
  europe-west4
  europe-west6
  europe-west8
  europe-west9
  europe-west10
  europe-west12
  me-central1
  me-central2
  me-west1
  northamerica-northeast1
  northamerica-northeast2
  northamerica-south1
  southamerica-east1
  southamerica-west1
  us-central1
  us-east1
  us-east4
  us-east5
  us-south1
  us-west1
  us-west2
  us-west3
  us-west4
)
```

`PUBLIC_DOMAIN` and `ADMIN_DOMAIN` must be HTTPS origin URLs only, with no
path, query, fragment, credentials, or trailing slash, because the app and audit
append paths directly.
The production audit rejects any other host, including lookalike domains and
private IP literals.

`PRIMARY_ADMIN_EMAIL` is the first managed Google account that owns the role
groups and belongs to `myrrh-super-admins@myrrh-jp.com`. The app creates the
local `SUPER_ADMIN` staff record on first successful admin access from Google
Group membership. `IAP_JWT_AUDIENCE` must match the Cloud Run IAP
signed-header audience format:
`/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME`.

`GCP_ORGANIZATION_ID`, `CLOUD_IDENTITY_DOMAIN`, `GITHUB_REPOSITORY`,
`GITHUB_REPOSITORY_ID`, `GITHUB_REPOSITORY_OWNER_ID`, `RUNTIME_SA`,
`BUILD_SA`, `AR_REPOSITORY`, `WIF_POOL_ID`, and `WIF_PROVIDER_ID` are required
for production verification.
The audit does not infer or accept the organization, Google Group, GitHub
repository identity, or deploy identity from loose defaults; they must match
these exact values.

The admin role groups must remain Cloud Identity / Google Workspace group
emails. Do not set them to personal `user:` identities. A person must belong to
exactly one role group; the application rejects ambiguous multi-role
membership.

## Organization and group baseline

Before this project is considered production-ready for the admin site, create or
use a Google Cloud Organization backed by Cloud Identity or Google Workspace.
Use the business domain, not a personal Gmail-only project.

Required external setup:

1. Create or use a Cloud Identity / Google Workspace tenant for
   `$CLOUD_IDENTITY_DOMAIN`.
2. Verify domain ownership in Google Admin.
3. Create the production Google Cloud project under that Organization, or
   migrate/cut over from the bootstrap project to a new Organization-backed
   project.
4. Create Cloud Identity security groups for admin roles:

```bash
declare -A ADMIN_ROLE_GROUP_NAMES=(
  ["$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"]="Myrrh Rental Space Super Admins"
  ["$ADMIN_ROLE_GROUP_ADMIN_EMAIL"]="Myrrh Rental Space Admins"
  ["$ADMIN_ROLE_GROUP_EDITOR_EMAIL"]="Myrrh Rental Space Editors"
  ["$ADMIN_ROLE_GROUP_VIEWER_EMAIL"]="Myrrh Rental Space Viewers"
)

for group_email in "${!ADMIN_ROLE_GROUP_NAMES[@]}"; do
  gcloud identity groups create "$group_email" \
    --organization="$CLOUD_IDENTITY_DOMAIN" \
    --group-type="security" \
    --display-name="${ADMIN_ROLE_GROUP_NAMES[$group_email]}" \
    --description="Myrrh Rental Space admin role group" \
    --with-initial-owner=with-initial-owner || true
done
```

Add the initial owner to the super admin role group:

```bash
gcloud identity groups memberships add \
  --group-email="$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL" \
  --member-email="$PRIMARY_ADMIN_EMAIL" \
  --roles=MEMBER
```

If the group creation command was run as `$PRIMARY_ADMIN_EMAIL`, Cloud Identity
can leave that account as the initial owner/member on every role group. Remove
the primary admin from non-super-admin role groups so the app can resolve
exactly one role:

```bash
for group_email in "$ADMIN_ROLE_GROUP_ADMIN_EMAIL" "$ADMIN_ROLE_GROUP_EDITOR_EMAIL" "$ADMIN_ROLE_GROUP_VIEWER_EMAIL"; do
  gcloud identity groups memberships delete \
    --group-email="$group_email" \
    --member-email="$PRIMARY_ADMIN_EMAIL" \
    --quiet || true
done
```

If a different setup operator created the groups, make sure that operator is
also removed from any admin role groups they should not use. No human Google
account may remain in more than one admin role group.

Create a clean Organization-backed project rather than keeping an orgless
project as production. If the bootstrap project already contains disposable
resources, recreate them in the Organization-backed project and cut over DNS and
secrets there. This keeps IAM, OAuth consent, groups, audit, and future policy
controls under one administrative boundary.

## Enable APIs

```bash
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  runapps.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  iap.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  sts.googleapis.com \
  iamcredentials.googleapis.com \
  cloudidentity.googleapis.com
```

## Artifact Registry

Create one Docker repository in the deploy region:

```bash
gcloud artifacts repositories create "$AR_REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Myrrh Rental Space containers"
```

If the repository already exists, keep it and do not recreate it.

## Service accounts

Create runtime, build, and scheduler identities:

```bash
gcloud iam service-accounts create myrrh-rental-space-runtime \
  --display-name="Myrrh Cloud Run runtime"

gcloud iam service-accounts create myrrh-rental-space-build \
  --display-name="Myrrh Cloud Build deployer"

gcloud iam service-accounts create myrrh-rental-space-scheduler \
  --display-name="Myrrh Cloud Scheduler OIDC caller"
```

Use this address in the examples below:

```bash
SCHEDULER_SA="myrrh-rental-space-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
```

Grant the build identity only the deployment permissions it needs:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/logging.logWriter"

gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/artifactregistry.writer"

gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud run services add-iam-policy-binding "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud run jobs add-iam-policy-binding "$MIGRATE_JOB_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/storage.objectViewer"
```

The second `roles/iam.serviceAccountUser` binding is intentional. GitHub
Actions authenticates as `$BUILD_SA` through WIF, and `cloudbuild.yaml` also
sets `$BUILD_SA` as the user-specified Cloud Build service account. The caller
therefore needs `iam.serviceAccounts.actAs` on that exact service account.
In production, keep both broad project grants absent:

- project-level `roles/iam.serviceAccountTokenCreator` grants must remain absent.
- project-level `roles/iam.serviceAccountUser` grants must remain absent.
- project-level `roles/iam.workloadIdentityUser` grants must remain absent.
- project-level `roles/run.admin` for `$BUILD_SA` must remain absent.
- project-level `roles/iap.admin` for `$BUILD_SA` must remain absent.

Grant deploy impersonation only on the exact service account resource that needs
it.
For this same-project production baseline, Cloud Build deploys to Cloud Run by
giving `$BUILD_SA` `roles/iam.serviceAccountUser` on `$RUNTIME_SA`; do not leave
`roles/iam.serviceAccountTokenCreator` on `$RUNTIME_SA`.

Grant Cloud Run admin only on the existing public service, admin service, and
migration job resources. IAP is enabled once during setup and then verified by
the production audit; recurring deploys do not need project-level IAP admin.

If a previous bootstrap left broad project-level deploy grants on `$BUILD_SA`,
remove them after the resource-level grants above exist:

```bash
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin" \
  --condition=None

gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iap.admin" \
  --condition=None
```

Do not create or download service account keys.

Grant the runtime service account owner access only to the admin role groups it
must read. This lets the app use Cloud Identity Groups API with Application
Default Credentials and avoids Google Workspace domain-wide delegation:

```bash
for group_email in \
  "$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL" \
  "$ADMIN_ROLE_GROUP_ADMIN_EMAIL" \
  "$ADMIN_ROLE_GROUP_EDITOR_EMAIL" \
  "$ADMIN_ROLE_GROUP_VIEWER_EMAIL"
do
  gcloud identity groups memberships add \
    --group-email="$group_email" \
    --member-email="$RUNTIME_SA" || true
  gcloud identity groups memberships modify-membership-roles \
    --group-email="$group_email" \
    --member-email="$RUNTIME_SA" \
    --add-roles=OWNER || true
done
```

## Default service account cleanup

Do not rely on the Compute Engine default service account for deploys or
runtime execution. This project uses the dedicated identities above instead.

Verify that the default Compute Engine service account is not attached to
running resources:

```bash
export DEFAULT_COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud run services list \
  --platform=managed \
  --format="table(metadata.name,spec.template.spec.serviceAccountName)"

gcloud run jobs list \
  --format="table(metadata.name,spec.template.spec.template.spec.serviceAccountName)"

gcloud compute instances list \
  --format="table(name,zone,status,serviceAccounts.email.scope())"

for location in global "${CLOUD_BUILD_REGIONS[@]}"; do
  gcloud builds triggers list \
    --project="$PROJECT_ID" \
    --region="$location" \
    --format="table(name,id,disabled,serviceAccount)"
done
```

If no active resource depends on the default Compute Engine service account,
remove its basic `Editor` role:

```bash
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEFAULT_COMPUTE_SA}" \
  --role="roles/editor" \
  --condition=None
```

At the organization or folder level, also enable the policy constraint that
prevents automatic role grants to default service accounts for new projects.

## Secret Manager

Create required secrets. Do not paste secret values into commit history or shell
history. Use stdin from a secure local prompt or your password manager.

Required by production startup:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `AUDIT_LOG_HMAC_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Required by Cloudflare integration:

- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ORIGIN_HEADER_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Required by the production image build and injected into the matching Cloud Run
revision at runtime:

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`

Create each secret once:

```bash
for name in \
  DATABASE_URL \
  BETTER_AUTH_SECRET \
  ENCRYPTION_KEY \
  AUDIT_LOG_HMAC_KEY \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_BUCKET_NAME \
  R2_PUBLIC_URL \
  CLOUDFLARE_ZONE_ID \
  CLOUDFLARE_API_TOKEN \
  CLOUDFLARE_ORIGIN_HEADER_SECRET \
  GOOGLE_CLIENT_ID \
  GOOGLE_CLIENT_SECRET
do
  gcloud secrets create "$name" --replication-policy="automatic" || true
done
```

Add a version:

```bash
printf '%s' "$SECRET_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
```

Runtime Secret Manager access for `$RUNTIME_SA` (and the build-time
`$BUILD_SA` binding for `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`) is provisioned
by `scripts/bootstrap-terraform.sh` (project-level `secretAccessor` for both
SAs, applied once by the project owner, idempotent on re-run). **The Cloud
Build SA has no Secret Manager IAM management permission** — attempts to give
it `secretmanager.secrets.setIamPolicy` would let a compromised build identity
self-grant `roles/secretmanager.secretAccessor` on `DATABASE_URL` /
`ENCRYPTION_KEY` / any other runtime secret, and no IAM Condition on
`iam.grantableRoles` can safely restrict that path.

The Terraform runner SA (`terraform-runner@...`) is now **structurally
prevented** from touching secret values, via the F1 closure landed in the
2026-07-14 `bootstrap-owns-all-project-IAM` refactor:

- **No `roles/resourcemanager.projectIamAdmin`**. Previously the runner held
  a conditional `projectIamAdmin` (CEL `hasOnly ['secretAccessor']`). The CEL
  restricts _which role_ can be granted but not _to whom_, so a compromised
  runner could still mint a fresh SA, grant `secretAccessor` to it, and
  impersonate it — the deny policy is scoped by principal and doesn't cover
  that new SA. Removing `projectIamAdmin` outright closes the chain.
- **No `roles/iam.serviceAccountAdmin`**. Previously the runner could call
  `iam.serviceAccounts.setIamPolicy` on any SA, letting it grant itself
  `tokenCreator` on runtime-sa and read every secret. Removing
  `serviceAccountAdmin` closes that chain and also removes the SA-create
  primitive used in Chain 1.
- **Custom role `terraformRunnerSecretManagerNoPolicyMgmt`** (bootstrap SSoT,
  12 permissions, GA) still gives the runner Secret Manager metadata / version
  CRUD, but excludes `secretmanager.secrets.setIamPolicy` /
  `secretmanager.secrets.getIamPolicy` — so it cannot per-secret grant
  `secretAccessor` to another principal either.
- **IAM Deny Policy** `block-terraform-runner-secret-value-read` (bootstrap
  managed, **optional defense-in-depth**) denies
  `secretmanager.googleapis.com/versions.access` / `.add` / `.destroy` /
  `.disable` / `.enable` to the runner. After the structural closure this is
  belt-and-suspenders (guards against future misconfiguration where someone
  hand-adds a strong role via Console). It requires
  `roles/iam.denyAdmin` at org/folder scope; environments without an
  org-admin skip it via `SKIP_DENY_POLICY=1` or automatic warning-on-failure —
  the primary control is the structural closure, so skipping is safe.

The runner's remaining role set (see `terraform/README.md` §
"Bootstrap-owned layout" for the full list) covers only resource-shape CRUD
for Cloud Run / Cloud Scheduler / Artifact Registry / Cloud Build worker
pool / WIF / LB / IAP / Service Usage plus the custom Secret Manager role —
no path to Secret Manager IAM policies remains.

### First-time setup (project owner, once)

```bash
export PROJECT_ID=myrrh-rental-space
bash scripts/bootstrap-terraform.sh
```

The bootstrap script creates the Terraform state bucket, all 4 SAs (runner

- runtime + build + scheduler), the WIF binding for GitHub Actions, and every
  project-level IAM binding (custom Secret Manager role + project-level grants
  for runtime-sa / build-sa + cross-SA impersonation). It is idempotent — safe
  to re-run. The bootstrap-owned bindings do **not** change from PR to PR;
  subsequent secret / metadata / resource changes flow through `terraform
apply`.

### Adding a new secret

1. Update `cloudbuild.yaml` `--set-secrets=` to include the new secret name.
2. Update `terraform/secrets.tf` `runtime_secrets` (or `build_secrets` if
   Cloud Build needs to read it via `availableSecrets`) with the same name.
3. Open a PR. `.github/workflows/terraform.yml` runs `terraform plan` on the
   PR and posts the diff for review.
4. On merge, `terraform apply` creates the new secret container (metadata).
   `runtime-sa` / `build-sa` already have project-level `secretAccessor`
   (granted by `scripts/bootstrap-terraform.sh`), so no additional IAM step
   is required — the next Cloud Build deploy picks up the new secret
   automatically.

Runtime / build SA already hold `roles/secretmanager.secretAccessor` at the
project level (granted by `scripts/bootstrap-terraform.sh`), so any secret
added to the project is automatically readable by both SAs. This is a
deliberate simplification: the previous per-secret binding pattern required
two-file updates (`cloudbuild.yaml` + `terraform/secret_iam.tf`) and had
drift-detection issues. Project-level scope is safe because runtime / build
SA are only used inside Cloud Run / Cloud Build (never externally exposed).
The legacy default Cloud Build service account must have no Secret Manager
access.

Secret generation rules used by this app:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY, AUDIT_LOG_HMAC_KEY, exactly 64 hex chars
openssl rand -base64 32   # NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
openssl rand -base64 32   # CLOUDFLARE_ORIGIN_HEADER_SECRET, mirror exactly in the Cloudflare request-header transform rule
```

Turnstile's secret key is managed from the admin settings page and stored
encrypted in the application database. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` remains
a deploy-time public value so the production image and client bundle use the
canonical widget site key. `CLOUDFLARE_ORIGIN_HEADER_SECRET` must match the
value Cloudflare injects into the `x-cloudflare-origin-secret` request header
before traffic reaches Cloud Run.

Audit log HMAC rotation is a clean-break operation. Do not add runtime legacy
keys. Plan a retention cutover and deploy a new chain boundary when changing
`AUDIT_LOG_HMAC_KEY` or `AUDIT_LOG_HMAC_KEY_ID`.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` follows the official Next.js self-hosting
contract: it is a consistent base64-encoded AES key supplied during
`next build` so Server Actions / Server Functions decrypt across Cloud Run
instances and revisions. Next.js records the effective key in the server
reference manifest inside the built image. Treat Artifact Registry image access
as access to this key, rotate it only with a rebuild + redeploy, and do not
expect changing the Cloud Run runtime secret alone to change the image-baked
key.

## Cloud Run migrate Job

Create the job once. `cloudbuild.yaml` updates the image, memory, command,
args, and `DATABASE_URL` secret on every deploy before executing it.

```bash
gcloud run jobs create prisma-migrate \
  --region="$REGION" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${SERVICE_NAME}:migrate-placeholder" \
  --service-account="$RUNTIME_SA" \
  --memory=1Gi \
  --cpu=1 \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=600s \
  --set-secrets=DATABASE_URL=DATABASE_URL:1 \
  --command=bunx \
  --args=--bun,prisma,migrate,deploy
```

Cloud Run resolves environment variable secrets at instance startup. Pin the
migrate Job's `DATABASE_URL` secret to a numeric Secret Manager version from the
first create command; do not use `latest` in production bootstrap or recurring
deploys. The production audit checks `Cloud Run migrate Job env is canonical`
and fails if `DATABASE_URL` is missing, set as a plain value, or references a
non-pinned Secret Manager version.
The audit also checks `Cloud Run migrate Job command is canonical` and fails if
the Job no longer runs `bunx --bun prisma migrate deploy`.
The audit also checks `Cloud Run migrate Job execution config is canonical` and
fails if the Job is not a single task with `--parallelism=1`, no task retries,
a 600 second task timeout, 1 vCPU, and 1Gi memory.

The placeholder image can be replaced by the first Cloud Build deploy. If the
create command requires an existing image, run the first build through Step 3
manually, then create the job, then rerun the full build.

## Cloud Build deploy

The repository already has `cloudbuild.yaml`. The normal production path is the
GitHub Actions workflow below. Direct `gcloud builds submit` is only for initial
bootstrap before WIF is live or for an explicit emergency deploy. In both cases,
run Cloud Build with required substitutions instead of relying on defaults:

Create the private worker pool once. The production build needs more memory
than the default Cloud Build pool provides, and `cloudbuild.yaml` points deploys
to this pool:

```bash
gcloud builds worker-pools create myrrh-deploy-pool \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --worker-machine-type=e2-highmem-4 \
  --worker-disk-size=100GB
```

```bash
SHORT_SHA="$(git rev-parse --short=7 HEAD)"

gcloud builds submit \
  --region="$REGION" \
  --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA="${SHORT_SHA}",_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_ADMIN_SERVICE_NAME="${ADMIN_SERVICE_NAME}",_IAP_JWT_AUDIENCE="${IAP_JWT_AUDIENCE}",_ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="${ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL}",_ADMIN_ROLE_GROUP_ADMIN_EMAIL="${ADMIN_ROLE_GROUP_ADMIN_EMAIL}",_ADMIN_ROLE_GROUP_EDITOR_EMAIL="${ADMIN_ROLE_GROUP_EDITOR_EMAIL}",_ADMIN_ROLE_GROUP_VIEWER_EMAIL="${ADMIN_ROLE_GROUP_VIEWER_EMAIL}",_REPOSITORY="${AR_REPOSITORY}",_WORKER_POOL="myrrh-deploy-pool",_SERVICE_ACCOUNT="${RUNTIME_SA}",_BUILD_SERVICE_ACCOUNT="${BUILD_SA}",_NEXT_PUBLIC_BASE_URL="${PUBLIC_DOMAIN}",_NEXT_PUBLIC_APP_URL="${PUBLIC_DOMAIN}",_BETTER_AUTH_URL="${PUBLIC_DOMAIN}",_ADMIN_APP_URL="${ADMIN_DOMAIN}",_CRON_OIDC_AUDIENCE="${PUBLIC_DOMAIN}",_CRON_SERVICE_ACCOUNT_EMAIL="${SCHEDULER_SA}",_NEXT_PUBLIC_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY}",_DATABASE_URL_SECRET_VERSION=1,_BREAKING_MIGRATION_DEPLOY=false,_BETTER_AUTH_SECRET_VERSION=1,_ENCRYPTION_KEY_SECRET_VERSION=1,_AUDIT_LOG_HMAC_KEY_SECRET_VERSION=1,_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION=1,_R2_ACCOUNT_ID_SECRET_VERSION=1,_R2_ACCESS_KEY_ID_SECRET_VERSION=1,_R2_SECRET_ACCESS_KEY_SECRET_VERSION=1,_R2_BUCKET_NAME_SECRET_VERSION=1,_R2_PUBLIC_URL_SECRET_VERSION=1,_CLOUDFLARE_ZONE_ID_SECRET_VERSION=1,_CLOUDFLARE_API_TOKEN_SECRET_VERSION=1,_CLOUDFLARE_ORIGIN_HEADER_SECRET_VERSION=1,_GOOGLE_CLIENT_ID_SECRET_VERSION=1,_GOOGLE_CLIENT_SECRET_SECRET_VERSION=1
```

For intentional non-expand/contract migrations, use breaking migration deploy
mode. The GitHub Actions production workflow detects changed migration SQL that
renames or drops columns/tables/types and automatically submits
`_BREAKING_MIGRATION_DEPLOY=true`. Emergency manual submits must set it
explicitly when the migration is not backward compatible.

In breaking migration deploy mode, `cloudbuild.yaml` uses the official Cloud Run
service disable mechanism (`gcloud run services update SERVICE --scaling=0`) for
both public and admin services, waits 310 seconds so old revisions can finish
in-flight requests, runs `prisma migrate deploy`, then deploys the new revisions
with `--scaling=auto`. This keeps the application and schema clean while
preventing old revisions from serving against the migrated database.

If `prisma migrate deploy` itself fails after the services have been quiesced,
the migrate-execute step restores `--scaling=auto` on the previous revisions
before propagating the failure back to Cloud Build. Without this recovery both
services would stay at `--scaling=0` until an operator manually re-enabled
them, giving the deploy an unbounded MTTR. The migration is not rolled back —
Prisma migrations are one-way — so operators still need to investigate the
migration error and either fix the migration SQL or hand-repair the database,
but the site keeps serving on the previous revision while that happens.

If an individual operator needs to run this emergency command before WIF is
available, grant that person a
temporary break-glass `roles/iam.serviceAccountUser` binding only on
`$BUILD_SA`, not on the project.

Remove that individual-user binding immediately after the deploy. The normal
production path is GitHub WIF impersonating `$BUILD_SA`.

This is because the production audit treats individual-user build `actAs`
bindings as non-clean posture.

```bash
gcloud iam service-accounts remove-iam-policy-binding "$BUILD_SA" \
  --project="$PROJECT_ID" \
  --member="user:OPERATOR_EMAIL" \
  --role="roles/iam.serviceAccountUser"
```

`cloudbuild.yaml` intentionally has no defaults for production-only
substitutions such as `_IAP_JWT_AUDIENCE`, the four
`_ADMIN_ROLE_GROUP_*_EMAIL` values, `_NEXT_PUBLIC_BASE_URL`,
`_NEXT_PUBLIC_APP_URL`, `_BETTER_AUTH_URL`, `_ADMIN_APP_URL`,
`_CRON_OIDC_AUDIENCE`, `_CRON_SERVICE_ACCOUNT_EMAIL`, and
`_NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
Missing values fail at Cloud Build submit
time, and explicit empty values are rejected by the first
`validate-production-substitutions` step before any image build or push.
For production submits, `_NEXT_PUBLIC_APP_URL`, `_BETTER_AUTH_URL`, and
`_CRON_OIDC_AUDIENCE` must match `_NEXT_PUBLIC_BASE_URL`; the single production
image is built for the canonical public origin, while the admin service gets
its admin-specific runtime `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` during
the Cloud Run deploy step.

`cloudbuild.yaml` sets all of these for user-specified Cloud Build service
accounts and the private worker pool:

```yaml
serviceAccount: projects/${PROJECT_ID}/serviceAccounts/${_BUILD_SERVICE_ACCOUNT}
options:
  logging: CLOUD_LOGGING_ONLY
  pool:
    name: projects/${PROJECT_ID}/locations/${_REGION}/workerPools/${_WORKER_POOL}
```

Production builds use the Next.js 16 default `next build` path. Do not switch
deploys to Webpack as a memory workaround; use the private pool so production
and CI stay on the same bundler path.

After the first successful deploy, prefer fixed Secret Manager versions for
production rollouts. Update the `_..._SECRET_VERSION` substitutions in
`.github/workflows/deploy-production.yml` when rotating a secret. Avoid `latest`
in production deploys because it makes rollbacks ambiguous.

## GitHub Actions production workflow

Production auto-deploy uses GitHub Actions with Google Workload Identity
Federation (WIF), then submits the existing `cloudbuild.yaml` with
`gcloud beta builds submit`. The beta submit command is used because this build
stores logs in Cloud Logging only; stable `gcloud builds submit` does not
stream those logs into the GitHub Actions job. This keeps GitHub as the merge
event source while avoiding service account keys and the Cloud Build GitHub
repository connection as a production dependency.
The workflow sets `install_components: beta` on
`google-github-actions/setup-gcloud` so the beta component is installed before
the non-interactive submit step and `gcloud` never prompts during deploy.

The workflow triggers on every push to `main`, plus explicit
`workflow_dispatch`. Do not add `paths` or `paths-ignore` filters to the
production deploy workflow; file-path filters make post-merge production
deployment conditional and reintroduce ambiguity about whether a merge should
deploy.

Do not create Cloud Build native triggers for production. That includes
`deploy-main`, console-created GitHub triggers, and manual
`gcloud builds triggers run`. Native triggers have their own trigger service
account path; this repository's production path is the GitHub WIF principal
impersonating `$BUILD_SA` and then calling `gcloud beta builds submit`.

Do not grant broad project IAM or permanent individual-user `actAs` grants to
make a native trigger work. If `gcloud builds triggers run` fails with
`cloudbuild.builds.create`, treat that as evidence that the legacy trigger path
is not the production path. Remove the trigger instead.

PR validation belongs in `.github/workflows/ci.yml`; production deploys only
after code reaches `main`.

Remove any existing native Cloud Build triggers and Cloud Build repository
connections before considering the project production-ready:

```bash
for location in global "${CLOUD_BUILD_REGIONS[@]}"; do
  gcloud builds triggers list \
    --project="$PROJECT_ID" \
    --region="$location" \
    --format="value(id)" |
  while read -r trigger_id; do
    test -n "$trigger_id" || continue
    gcloud builds triggers delete "$trigger_id" \
      --project="$PROJECT_ID" \
      --region="$location" \
      --quiet
  done
done

for location in "${CLOUD_BUILD_REGIONS[@]}"; do
  gcloud builds connections list \
    --project="$PROJECT_ID" \
    --region="$location" \
    --format="value(name)" |
  while read -r connection_name; do
    test -n "$connection_name" || continue
    gcloud builds connections delete "$connection_name" \
      --project="$PROJECT_ID" \
      --region="$location" \
      --quiet
  done
done
```

Create the WIF pool and provider:

```bash
gcloud iam workload-identity-pools create "$WIF_POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions" \
  --description="GitHub Actions OIDC federation for production deploys"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$WIF_POOL_ID" \
  --display-name="GitHub Myrrh Rental Space" \
  --description="${GITHUB_REPOSITORY} main deploy workflow" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner=assertion.repository_owner,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow=assertion.workflow" \
  --attribute-condition="assertion.repository == '${GITHUB_REPOSITORY}' && assertion.repository_id == '${GITHUB_REPOSITORY_ID}' && assertion.repository_owner_id == '${GITHUB_REPOSITORY_OWNER_ID}' && assertion.ref == 'refs/heads/main' && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')"
```

Allow only that repository identity to impersonate the build service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
  --project="$PROJECT_ID" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository_id/${GITHUB_REPOSITORY_ID}" \
  --role="roles/iam.workloadIdentityUser"
```

The repository workflow `.github/workflows/deploy-production.yml` is the
production deploy workflow. It authenticates with `google-github-actions/auth`,
sets up `gcloud` with `install_components: beta`, and runs
`gcloud beta builds submit` with the fixed production substitutions and Secret
Manager version `1` values.

Verify the WIF provider and service account binding:

```bash
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$WIF_POOL_ID" \
  --format="yaml(name,state,attributeCondition,attributeMapping)"

gcloud iam service-accounts get-iam-policy "$BUILD_SA" \
  --project="$PROJECT_ID" \
  --format="yaml(bindings)"
```

## Cloud Run service settings

`cloudbuild.yaml` deploys two services from the same image:

- public: `$SERVICE_NAME`, `APP_SURFACE=public`, unauthenticated;
- admin: `$ADMIN_SERVICE_NAME`, `APP_SURFACE=admin`, Cloud Run direct IAP.

IAP is enabled once during setup and then verified by the production audit.
The recurring Cloud Build deploy updates the admin service revision but does
not pass `--iap`, does not reapply `--no-allow-unauthenticated`, and does not
require project-level `roles/iap.admin`.

The public service keeps Cloud Run network ingress at `all` because the public
custom domain must remain directly reachable. The admin service is load
balancer-only: `cloudbuild.yaml` reapplies
`--ingress=internal-and-cloud-load-balancing` and `--no-default-url` on every
admin deploy. The production audit verifies the live
`run.googleapis.com/ingress`, `run.googleapis.com/ingress-status`, and
`run.googleapis.com/default-url-disabled` annotations. Do not reintroduce a
direct admin `run.app` production entrypoint.

Confirm the runtime service accounts:

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="value(spec.template.spec.serviceAccountName)"

gcloud run services describe "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --format="value(spec.template.spec.serviceAccountName)"
```

Keep `/api/live` as the startup and liveness probe path. It is intentionally DB
independent. Use `/api/health` only for manual or uptime checks that are allowed
to touch dependencies.

## Admin load balancer and DNS

The admin user-facing origin is `https://admin.myrrh-jp.com`. It must be served
by a global external HTTPS Application Load Balancer with a serverless NEG
pointing at `$ADMIN_SERVICE_NAME` in `$REGION`.

Current production resource names:

- global IPv4 address: `myrrh-admin-lb-ip` (`8.233.111.15`);
- global IPv6 address: `myrrh-admin-lb-ipv6` (`2600:1901:0:6b8e::`);
- serverless NEG: `myrrh-admin-neg` in `$REGION`;
- backend service: `myrrh-admin-backend`;
- HTTPS URL map / proxy / forwarding rule:
  `myrrh-admin-url-map`, `myrrh-admin-https-proxy`,
  `myrrh-admin-https-rule`;
- HTTP redirect URL map / proxy / forwarding rule:
  `myrrh-admin-http-redirect`, `myrrh-admin-http-proxy`,
  `myrrh-admin-http-rule`;
- IPv6 HTTPS / HTTP forwarding rules:
  `myrrh-admin-https-rule-ipv6`, `myrrh-admin-http-rule-ipv6`;
- Google-managed certificate: `myrrh-admin-cert-20260705` for
  `admin.myrrh-jp.com`.

Required contract:

- DNS for `admin.myrrh-jp.com` points to the global external HTTPS load
  balancer, not to a direct Cloud Run `run.app` URL.
- Cloudflare DNS must contain exactly one DNS-only A record:
  `admin.myrrh-jp.com -> 8.233.111.15`, with `proxied=false`. Do not orange-cloud
  this record; Google-managed certificate provisioning needs the hostname to
  resolve directly to the load balancer IP.
- Cloudflare DNS must contain exactly one DNS-only AAAA record:
  `admin.myrrh-jp.com -> 2600:1901:0:6b8e::`, with `proxied=false`. Add this only
  after the GCP IPv6 forwarding rules exist.
- Cloudflare API automation for this record requires a token scoped to the
  `myrrh-jp.com` zone with DNS read/edit permission. The cache purge / zone
  diagnostics token is not sufficient unless it also has DNS record access.
- The load balancer routes host `admin.myrrh-jp.com` to the admin serverless
  NEG. A single host-wide route is preferred; the app redirects `/` to `/admin`
  on the admin surface.
- IAP is enabled on the Cloud Run admin service only. Do not enable IAP on the
  load balancer backend service, because Google Cloud does not support IAP on
  both the load balancer and the Cloud Run service for the same traffic path.
- The admin Cloud Run service uses `--ingress=internal-and-cloud-load-balancing`
  and `--no-default-url`, making the load balancer the only internet ingress
  path.
- `$ADMIN_APP_URL`, `BETTER_AUTH_URL` on the admin service, and
  `NEXT_PUBLIC_APP_URL` on the admin service are all exactly
  `https://admin.myrrh-jp.com`.

## IAP admin access

Daily staff onboarding, offboarding, and access checks are documented in
`docs/admin-access.md`. Keep this section focused on infrastructure setup and
use the operations runbook when changing people.

Enable Cloud Run direct IAP on the admin service only:

```bash
gcloud run services update "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --iap
```

### First-time OAuth client setup

If this is the first Cloud Run direct IAP setup in a project without a Google
Cloud organization, or if you need to grant access to users outside the
organization, do the one-time OAuth setup from the Google Cloud console.
Google's Cloud Run IAP documentation explicitly notes that OAuth clients cannot
be created programmatically for this first-time setup.

This is a bootstrap-only path. The production target for this repository is an
Organization-backed project with a Cloud Identity / Google Workspace admin
group. If a deploy prints the orgless-project warning, the service can still be
protected by IAP, but the project has not reached the final production posture
and `bun run gcp:audit-production-iap` must fail.

Use the console path:

1. Cloud Run -> `$ADMIN_SERVICE_NAME` -> Security.
2. Open Security -> Identity-Aware Proxy.
3. In the Applications tab, open the overflow menu for
   `$ADMIN_SERVICE_NAME`, then click Settings.
4. For projects without a Google Cloud organization, choose Custom OAuth.
5. Click Auto generate credentials, then Save.

If the admin URL returns `502` with
`Empty Google Account OAuth client ID(s)/secret(s).`, IAP is enabled but this
OAuth setup is still missing. After completing the setup, retry the verification
commands below.

Grant the IAP service agent permission to invoke the admin Cloud Run service:

```bash
gcloud run services add-iam-policy-binding "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

Grant admin users through the Cloud Identity / Google Workspace group, not
individual users:

```bash
for group_email in \
  "$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL" \
  "$ADMIN_ROLE_GROUP_ADMIN_EMAIL" \
  "$ADMIN_ROLE_GROUP_EDITOR_EMAIL" \
  "$ADMIN_ROLE_GROUP_VIEWER_EMAIL"
do
  gcloud iap web add-iam-policy-binding \
    --resource-type=cloud-run \
    --service="$ADMIN_SERVICE_NAME" \
    --region="$REGION" \
    --member="group:${group_email}" \
    --role="roles/iap.httpsResourceAccessor" \
    --condition=None
done
```

Google Cloud's current `gcloud iap web add-iam-policy-binding` and
`get-iam-policy` references support `--resource-type=cloud-run`. If your local
Google Cloud CLI help does not list `cloud-run`, update the CLI before mutating
IAP policy. The read-only production audit uses the official IAP REST API
resource
`iap_web/cloud_run-${REGION}/services/${ADMIN_SERVICE_NAME}:getIamPolicy` and
does not depend on local `gcloud iap web --resource-type=cloud-run` support.

Operational rule:

- staff should use Google accounts;
- a non-Gmail address is fine only if it is a Google account or managed through
  Google Workspace / Cloud Identity;
- do not grant `allUsers` or `allAuthenticatedUsers` to the admin service;
- do not grant `roles/iap.httpsResourceAccessor` directly to `user:*` members
  in production;
- add staff by creating or inviting the Google Workspace / Cloud Identity user,
  adding the user to exactly one admin role group, then sending the common admin
  URL;
- remove users by removing them from all admin role groups and then suspending
  or deleting the Google Workspace / Cloud Identity user.

When migrating from a bootstrap individual grant, do this in order:

1. grant `roles/iap.httpsResourceAccessor` to all four admin role groups;
2. confirm a member of exactly one role group can open `${ADMIN_DOMAIN}/admin`;
3. remove any `user:*` IAP accessor grants;
4. run `bun run gcp:audit-production-iap`.

### IAP OAuth Admin API shutdown (2026-03-19) and Console-only rotation

Google is shutting down the **IAP OAuth Admin API** — the API that backs
`gcloud iap oauth-brands`, `gcloud iap oauth-clients`, and the Terraform
`google_iap_brand` / `google_iap_client` resources. Timeline:

- **2026-01-19**: creating new IAP-managed OAuth clients through the API is
  blocked for new projects. Existing clients keep working; the shutdown does
  not brick IAP itself.
- **2026-03-19**: the API is fully shut down. `gcloud iap oauth-brands`,
  `gcloud iap oauth-clients`, and Terraform `google_iap_client` /
  `google_iap_brand` all stop functioning. Any subsequent create, rotation,
  or delete of an IAP OAuth client must happen from the Cloud Console.

Cloud Run direct IAP continues to enforce access end-to-end after the
shutdown; only the _management surface_ for the underlying OAuth brand /
client moves to Console-only. IAM bindings (the
`google_iap_web_cloud_run_service_iam_member` resources in
`terraform/iap.tf`) are unaffected — those live on a different API surface.

#### Terraform posture

This repository's `terraform/iap.tf` intentionally does **not** declare a
`google_iap_client` or `google_iap_brand` resource. The OAuth brand and
client are created once in the Console during first-time setup and never
imported. Keep this posture:

- do not add `google_iap_client` in Terraform. New `create` calls will fail
  hard after 2026-03-19, and even an `import` before that date is pointless
  because subsequent updates (secret rotation, redirect URIs) cannot round-
  trip through the deprecated API.
- if a project ever ends up with a `google_iap_client` in Terraform state
  (from an old bootstrap or a branch that predates this note), either
  `terraform state rm` the resource and let Console own it, or wrap it with

  ```hcl
  lifecycle {
    ignore_changes = [
      client_secret,
      display_name,
    ]
  }
  ```

  to prevent Terraform from attempting doomed API calls during future plans.

#### Rotate the IAP OAuth client secret (Console procedure)

Rotate on suspected leak, offboarding of anyone who could have seen the
secret, or on a scheduled cadence. All steps are Console-only from
2026-03-19 onward and already work today.

1. Google Cloud Console -> **APIs & Services** -> **Credentials**.
2. Under **OAuth 2.0 Client IDs**, open the IAP client. The display name
   typically matches the OAuth brand set during first-time setup (often
   `IAP-App-Engine-app` or `$ADMIN_SERVICE_NAME`); confirm the client ID
   matches the value shown on the IAP Applications page for
   `$ADMIN_SERVICE_NAME`.
3. Click **Add secret** (older UI: **Reset secret**). Google generates a new
   secret while keeping the previous secret valid for a short overlap window
   (48h at time of writing). Copy the new secret immediately — it is only
   shown once.
4. Verify the OAuth **client ID** has not changed. The ID is stable across
   rotations; only the secret rotates. If the client ID did change, IAP was
   reconfigured with a new client rather than a secret rotation — treat that
   as first-time setup and re-run `bun run gcp:audit-production-iap`.
5. For this repo's default setup (Cloud Run direct IAP enabled with
   `gcloud run services update ... --iap` — see the setup command above),
   the OAuth secret is stored inside IAP's own configuration. The app never
   reads it, so no Cloud Run env var or Secret Manager update is required.
   Verify by loading `${ADMIN_DOMAIN}/admin` in a browser signed in as an
   admin group member; the sign-in flow must still succeed.
6. If the secret was ever copied outside IAP (Secret Manager entry, an
   external CI env var such as a hypothetical `IAP_CLIENT_SECRET`, a
   `.env.*` file, third-party monitoring), update every copy within the
   overlap window. This repo has no such copies today; check
   `gcloud secrets list` and CI environment settings before assuming.
7. Return to **APIs & Services** -> **Credentials** and revoke the previous
   secret once all consumers use the new one, or wait for it to expire.

If IAP was originally set up through the **Custom OAuth** path (orgless
project bootstrap — step 4 of the console setup above), the OAuth consent
screen lives under **APIs & Services -> OAuth consent screen**. Do not
delete the consent screen during rotation; only the secret needs rotating.

#### Post-rotation checks

- `curl -I "${ADMIN_DOMAIN}/admin"` still redirects unauthenticated visitors
  to the Google sign-in flow (not `502` and not `403`).
- A member of one admin role group can still open `${ADMIN_DOMAIN}/admin`
  end-to-end.
- `bun run gcp:audit-production-iap` passes.

## Cloud Scheduler

The app validates `/api/cron/*` calls with a Google OIDC ID token issued by
Cloud Scheduler. Use the dedicated scheduler service account and set one stable
audience shared by all cron jobs, normally the public origin without a trailing
slash.

```bash
PROJECT_ID="$PROJECT_ID" \
SERVICE_URL="$PUBLIC_DOMAIN" \
REGION="$REGION" \
CRON_SERVICE_ACCOUNT_EMAIL="$SCHEDULER_SA" \
CRON_OIDC_AUDIENCE="$PUBLIC_DOMAIN" \
bash scripts/setup-cloud-scheduler.sh
```

The setup script uses Cloud Scheduler's official OIDC flags:
`--oidc-service-account-email` and `--oidc-token-audience`. The app verifies
the token signature, expected audience, and exact service account email before
running any cron handler logic.

## Production verification

Run these checks after deployment:

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="yaml(status.url,metadata.annotations,spec.template.spec.serviceAccountName,spec.template.metadata.annotations)"

gcloud run services describe "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --format="yaml(status.url,metadata.annotations,spec.template.spec.serviceAccountName,spec.template.metadata.annotations)"

gcloud run jobs execute prisma-migrate --region="$REGION" --wait

curl -fsS "${PUBLIC_DOMAIN}/api/live"
curl -fsS "${PUBLIC_DOMAIN}/api/health"
curl -I "${PUBLIC_DOMAIN}/admin"
curl -I "${ADMIN_DOMAIN}/"
curl -I "${ADMIN_DOMAIN}/admin"
```

Before running the live GCP audit, verify that the current shell can refresh
Google Cloud credentials without an interactive prompt:

```bash
gcloud auth print-access-token >/dev/null
```

If this fails with `cannot prompt during non-interactive execution`, run
`gcloud auth login` in the same Windows user/profile used by the audit process,
then rerun the token check. Do not debug Cloud Build IAM until this preflight
succeeds.

```bash
GCP_PROJECT_ID="$PROJECT_ID" \
GCP_ORGANIZATION_ID="$GCP_ORGANIZATION_ID" \
CLOUD_IDENTITY_DOMAIN="$CLOUD_IDENTITY_DOMAIN" \
REGION="$REGION" \
SERVICE_NAME="$SERVICE_NAME" \
ADMIN_SERVICE_NAME="$ADMIN_SERVICE_NAME" \
PUBLIC_DOMAIN="$PUBLIC_DOMAIN" \
ADMIN_DOMAIN="$ADMIN_DOMAIN" \
ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL" \
ADMIN_ROLE_GROUP_ADMIN_EMAIL="$ADMIN_ROLE_GROUP_ADMIN_EMAIL" \
ADMIN_ROLE_GROUP_EDITOR_EMAIL="$ADMIN_ROLE_GROUP_EDITOR_EMAIL" \
ADMIN_ROLE_GROUP_VIEWER_EMAIL="$ADMIN_ROLE_GROUP_VIEWER_EMAIL" \
RUNTIME_SERVICE_ACCOUNT="$RUNTIME_SA" \
BUILD_SERVICE_ACCOUNT="$BUILD_SA" \
MIGRATE_JOB_NAME="$MIGRATE_JOB_NAME" \
AR_REPOSITORY="$AR_REPOSITORY" \
CRON_SERVICE_ACCOUNT_EMAIL="$SCHEDULER_SA" \
GITHUB_REPOSITORY="$GITHUB_REPOSITORY" \
GITHUB_REPOSITORY_ID="$GITHUB_REPOSITORY_ID" \
GITHUB_REPOSITORY_OWNER_ID="$GITHUB_REPOSITORY_OWNER_ID" \
WIF_POOL_ID="$WIF_POOL_ID" \
WIF_PROVIDER_ID="$WIF_PROVIDER_ID" \
bun run gcp:audit-production-iap
```

If `gcloud` is installed but not on `PATH`, set `GCLOUD_BIN` to the gcloud executable before running the audit. Windows user installs commonly use `$env:GCLOUD_BIN = "$env:LOCALAPPDATA\google-cloud-sdk\bin\gcloud.cmd"`.

Expected results:

- `/api/live` returns 200;
- `/api/health` returns 200 only when DB and dependencies are healthy;
- `${PUBLIC_DOMAIN}/admin` returns 404 from `APP_SURFACE=public`;
- `${ADMIN_DOMAIN}/` redirects unauthenticated visitors to Google/IAP;
- `${ADMIN_DOMAIN}/admin` redirects unauthenticated visitors to Google/IAP;
- with an IAP-allowed Google account in exactly one admin role group, `/admin`
  opens the dashboard and auto-syncs the local staff record without an app
  password form;
- `.github/workflows/deploy-production.yml` starts on every `main` push and the
  Cloud Build it submits succeeds;
- Cloud Logging shows `x-cloud-trace-context` correlation for requests.
- Cloud Scheduler cron jobs use Google OIDC tokens only. They must use
  `$SCHEDULER_SA` as `oidcToken.serviceAccountEmail`, `$PUBLIC_DOMAIN` as
  `oidcToken.audience`, and no old `Authorization: Bearer` cron secrets.
- The audit checks `public Cloud Run runtime env is canonical` and
  `admin Cloud Run runtime env is canonical`. In particular, `BETTER_AUTH_URL`
  must be the canonical public origin on the public service and the canonical
  admin origin on the admin service, with no trailing slash.
  The audit checks `Cloud Run service ingress is canonical`; recurring deploys
  must keep the public service at `--ingress=all` and the admin service at
  `--ingress=internal-and-cloud-load-balancing`. The audit also checks
  `admin Cloud Run default run.app URL is disabled`; admin recurring deploys
  must keep `--no-default-url`.
  The audit also checks `Cloud Run service identities are dedicated`,
  `Cloud Run migrate Job identity is dedicated`,
  `Cloud Run migrate Job env is canonical`, and
  `Cloud Run migrate Job command is canonical`, and
  `Cloud Run migrate Job execution config is canonical`; the public service,
  admin service, and migrate Job must all run as `$RUNTIME_SA`, not the Compute
  Engine default service account, and the migrate Job must bind `DATABASE_URL`
  from `DATABASE_URL:1` in Secret Manager while running
  `bunx --bun prisma migrate deploy` as one task, one parallel task, no retries,
  600 second task timeout, 1 vCPU, and 1Gi memory.
  Recurring Cloud Build deploys replace Cloud Run runtime env and secret
  bindings with `--set-env-vars` and `--set-secrets`; they do not rely on
  legacy `--update-*` / `--remove-*` drift cleanup.
  Legacy clean-break names `CRON_SECRET`, `ADMIN_LOGIN_TOKEN`,
  `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_NAME` must be absent from Cloud Run
  runtime env.
- The audit checks `required Secret Manager versions are enabled` using
  `gcloud secrets versions describe` metadata only. Every production secret
  referenced by Cloud Run must point at the pinned numeric version `1`, and that
  version must report `state=ENABLED`; do not use `latest` for production.
- The audit checks `required Secret Manager accessor IAM is least privilege`
  with `gcloud secrets get-iam-policy`, and checks
  `project IAM has no broad Secret Manager accessor grants` on the project IAM
  policy. Required runtime secrets must have only `$RUNTIME_SA` as
  `roles/secretmanager.secretAccessor`; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
  must have only `$RUNTIME_SA` and `$BUILD_SA`. Remove any default Cloud Build
  service account accessor from Secret Manager.
- The audit checks resource-level deploy IAM with
  `gcloud artifacts repositories get-iam-policy`,
  `gcloud run services get-iam-policy`, `gcloud run jobs get-iam-policy`,
  `gcloud iam service-accounts get-iam-policy`, and
  `gcloud storage buckets get-iam-policy`. The checks
  `Artifact Registry repository writer is limited to build service account`,
  `Cloud Run deploy admin grants are limited to build service account`,
  `runtime service account actAs grant is limited to build service account`,
  `runtime service account tokenCreator grants are absent`,
  and `Cloud Build source bucket objectViewer is limited to build service account`
  must pass. The only expected member for those exact deployment
  roles is `serviceAccount:${BUILD_SA}`; remove default Cloud Build service
  account, runtime service account, and individual-user members from those
  role bindings.
- The audit checks `public Cloud Run revisions are healthy` and
  `admin Cloud Run revisions are healthy`. Failed or pending revisions are not
  clean production posture. If the audit prints a revision `deleteCommands=`
  entry, first confirm that revision has traffic 0% and is not the latest ready revision,
  then remove it with the official command:

  ```bash
  gcloud run revisions delete "REVISION_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --quiet
  ```

- `bun run gcp:audit-production-iap` passes. The audit check
  `production HTTP domains are canonical HTTPS URLs` verifies URL shape before
  checking `/api/live`, `/api/health`, public `/admin` hiding,
  `admin root redirects unauthenticated visitors to Google/IAP`, and
  `admin /admin redirects unauthenticated visitors to Google/IAP`. The audit
  reads Cloud Run IAP access through the official IAP REST API resource
  `iap_web/cloud_run-${REGION}/services/${ADMIN_SERVICE_NAME}:getIamPolicy`,
  so it does not depend on local `gcloud iap web --resource-type=cloud-run`
  support. If it fails
  on Organization, Cloud Identity group, individual IAP grants, WIF,
  user-managed service account key absence, project-level
  `roles/iam.serviceAccountTokenCreator`, project-level
  `roles/iam.serviceAccountUser`, project-level
  `roles/iam.workloadIdentityUser`, project-level `roles/run.admin` for
  `$BUILD_SA`, project-level `roles/iap.admin` for `$BUILD_SA`, individual
  build service account `actAs` grants, resource-level deploy IAM grants,
  Cloud Scheduler OIDC configuration,
  scheduler service account has no user-managed keys,
  Cloud Run service identities are dedicated,
  Cloud Run migrate Job identity is dedicated,
  Cloud Run migrate Job env is canonical,
  Cloud Run migrate Job command is canonical,
  Cloud Run migrate Job execution config is canonical,
  canonical Cloud Run runtime env values,
  required Secret Manager versions are enabled,
  required Secret Manager accessor IAM is least privilege,
  project IAM has no broad Secret Manager accessor grants,
  legacy Cloud Build
  triggers/connections, or live HTTP behavior, the admin site may be protected
  but the GCP posture is not the final production baseline.

## Current repository contract

The current `cloudbuild.yaml` already handles:

- Docker image build with Bun;
- Artifact Registry image push;
- dedicated migrator image;
- Cloud Run Job update and execution for `bunx --bun prisma migrate deploy`;
- public and admin Cloud Run deploys with service account, probes, env vars,
  secrets, public `--ingress=all`, admin
  `--ingress=internal-and-cloud-load-balancing`, and admin `--no-default-url`.
  Recurring deploys do not mutate admin IAP.
- fail-fast validation for admin `IAP_JWT_AUDIENCE` and the four admin role
  group emails. Initial `SUPER_ADMIN` creation is synced from the super-admin
  Google Group on first access, not bootstrapped from app env.

Do not treat any previous Cloud Build trigger inventory as current proof. The
production target is still zero native triggers and zero Cloud Build repository
connections, but a fresh `bun run gcp:audit-production-iap` pass is the proof.
If a native trigger such as `deploy-main` exists, delete it instead of adding
Cloud Build Editor, broad project IAM, or permanent individual-user `actAs`
grants to make that trigger runnable.

The audited production target posture is:

1. project `myrrh-rental-space` is under organization `844678510879`;
2. Cloud Identity domain `myrrh-jp.com` owns the four admin role groups
   `myrrh-super-admins@myrrh-jp.com`, `myrrh-admins@myrrh-jp.com`,
   `myrrh-editors@myrrh-jp.com`, and `myrrh-viewers@myrrh-jp.com`;
3. `.github/workflows/deploy-production.yml` is the only production
   auto-deploy workflow;
4. native Cloud Build triggers and Cloud Build GitHub repository connections
   are absent;
5. Cloud Scheduler cron jobs use OIDC from `$SCHEDULER_SA` with `$PUBLIC_DOMAIN`
   as the audience, no shared-secret HTTP headers, and no user-managed keys on
   `$SCHEDULER_SA`;
6. `$BUILD_SA` has project-level `roles/cloudbuild.builds.builder` and
   `roles/logging.logWriter`, but no project-level `roles/run.admin` or
   `roles/iap.admin`;
7. `$BUILD_SA` is the only member for Artifact Registry repository
   `roles/artifactregistry.writer`, public/admin/migrate Cloud Run
   `roles/run.admin`, runtime service account `roles/iam.serviceAccountUser`,
   and Cloud Build source bucket `roles/storage.objectViewer`; runtime service
   account `roles/iam.serviceAccountTokenCreator` has no members;
8. Secret Manager accessor grants are secret-level only: runtime secrets allow
   `$RUNTIME_SA`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` allows `$RUNTIME_SA` and
   `$BUILD_SA`, and project-level `roles/secretmanager.secretAccessor` is
   absent;
9. public Cloud Run keeps `run.googleapis.com/ingress` and
   `run.googleapis.com/ingress-status` set to `all`; admin Cloud Run keeps both
   annotations set to `internal-and-cloud-load-balancing` and
   `run.googleapis.com/default-url-disabled` set to `true`;
10. public, admin, and migrate Cloud Run resources all use `$RUNTIME_SA` as
    their service identity;
11. the migrate Job runs `bunx --bun prisma migrate deploy` with `DATABASE_URL`
    bound from Secret Manager version `1`, one task, one parallel task, no
    retries, a 600 second task timeout, 1 vCPU, and 1Gi memory;
12. `bun run gcp:audit-production-iap` is the gate for proving the live posture
    still matches this target after infrastructure changes.

If the audit has not passed after the latest GCP-side change, treat the list
above as the desired target state, not as proof of the current project state.

## Alerting

Cloud Monitoring alert policies and their supporting log-based metrics live
under `infra/monitoring/`, with a one-page runbook at
[`docs/observability/alerting.md`](observability/alerting.md). Five signals
are wired: ReportedErrorEvent burst, severity=CRITICAL, `/api/health` 5xx,
cron OIDC / config failure, and Prisma pool acquire-timeout. Any change to
the runtime emit path (severity mapping, log message text, cron gate return
codes) must ship together with the matching YAML update.
