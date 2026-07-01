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
- Cloud Build triggers:
  <https://cloud.google.com/build/docs/automating-builds/create-manage-triggers>
- `gcloud builds triggers run`:
  <https://cloud.google.com/sdk/gcloud/reference/builds/triggers/run>
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

## Target architecture

Cloud Run service-level IAP protects an entire service. Do not enable IAP on
the public service. The clean production target is:

- one public Cloud Run service for public routes, deployed with
  `APP_SURFACE=public` and `--allow-unauthenticated`;
- one admin Cloud Run service for admin routes, deployed with
  `APP_SURFACE=admin` and `--no-allow-unauthenticated`, with Cloud Run direct
  IAP enabled once during setup;
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
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin` -> admin
  service with IAP
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin/*` -> admin
  service with IAP
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin/api/*` ->
  admin service with IAP
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/api/instagram/oauth/*`
  -> admin service with IAP
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/api/google-business-profile/oauth/*`
  -> admin service with IAP
- `https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/preview/*` -> admin
  service with IAP

If a same-domain `/admin` path is required later, add an external HTTPS
Application Load Balancer and path-route admin traffic to the admin service.
That is optional for the current recommended setup because Cloud Run direct IAP
is GA and avoids DNS / edge migration risk.

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
export ADMIN_DOMAIN="https://myrrh-rental-space-admin-da57q4squa-an.a.run.app"
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
`BUILD_SA`, `WIF_POOL_ID`, and `WIF_PROVIDER_ID` are required for production
verification.
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
    --with-initial-owner="$PRIMARY_ADMIN_EMAIL" || true
done
```

Add the initial owner to the super admin role group:

```bash
gcloud identity groups memberships add \
  --group-email="$ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL" \
  --member-email="$PRIMARY_ADMIN_EMAIL" \
  --roles=MEMBER
```

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

Create a runtime identity and a build identity:

```bash
gcloud iam service-accounts create myrrh-rental-space-runtime \
  --display-name="Myrrh Cloud Run runtime"

gcloud iam service-accounts create myrrh-rental-space-build \
  --display-name="Myrrh Cloud Build deployer"
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

- project-level `roles/iam.serviceAccountUser` grants must remain absent.
- project-level `roles/iam.workloadIdentityUser` grants must remain absent.
- project-level `roles/run.admin` for `$BUILD_SA` must remain absent.
- project-level `roles/iap.admin` for `$BUILD_SA` must remain absent.

Grant deploy impersonation only on the exact service account resource that needs
it.

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
    --member-email="$RUNTIME_SA" \
    --roles=OWNER || true
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
- `CRON_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Required when Cloudflare cache purge is enabled:

- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
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
  CRON_SECRET \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_BUCKET_NAME \
  R2_PUBLIC_URL \
  CLOUDFLARE_ZONE_ID \
  CLOUDFLARE_API_TOKEN \
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

Grant the runtime identity access to only the secrets it needs:

```bash
for name in \
  DATABASE_URL \
  BETTER_AUTH_SECRET \
  ENCRYPTION_KEY \
  CRON_SECRET \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_BUCKET_NAME \
  R2_PUBLIC_URL \
  CLOUDFLARE_ZONE_ID \
  CLOUDFLARE_API_TOKEN \
  GOOGLE_CLIENT_ID \
  GOOGLE_CLIENT_SECRET
do
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

Grant the build identity access only to the build-time secret:

```bash
gcloud secrets add-iam-policy-binding NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Secret generation rules used by this app:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET, CRON_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY, exactly 64 hex chars
openssl rand -base64 32   # NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
```

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` follows the official Next.js self-hosting
contract: it is a consistent base64-encoded AES key supplied during
`next build` so Server Actions / Server Functions decrypt across Cloud Run
instances and revisions. Next.js records the effective key in the server
reference manifest inside the built image. Treat Artifact Registry image access
as access to this key, rotate it only with a rebuild + redeploy, and do not
expect changing the Cloud Run runtime secret alone to change the image-baked
key.

## Cloud Run migrate Job

Create the job once. `cloudbuild.yaml` updates the image, memory, and
`DATABASE_URL` secret on every deploy before executing it.

```bash
gcloud run jobs create prisma-migrate \
  --region="$REGION" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${SERVICE_NAME}:migrate-placeholder" \
  --service-account="$RUNTIME_SA" \
  --memory=1Gi \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=bunx \
  --args=--bun,prisma,migrate,deploy
```

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
  --substitutions=SHORT_SHA="${SHORT_SHA}",_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_ADMIN_SERVICE_NAME="${ADMIN_SERVICE_NAME}",_IAP_JWT_AUDIENCE="${IAP_JWT_AUDIENCE}",_ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="${ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL}",_ADMIN_ROLE_GROUP_ADMIN_EMAIL="${ADMIN_ROLE_GROUP_ADMIN_EMAIL}",_ADMIN_ROLE_GROUP_EDITOR_EMAIL="${ADMIN_ROLE_GROUP_EDITOR_EMAIL}",_ADMIN_ROLE_GROUP_VIEWER_EMAIL="${ADMIN_ROLE_GROUP_VIEWER_EMAIL}",_REPOSITORY="${AR_REPOSITORY}",_WORKER_POOL="myrrh-deploy-pool",_SERVICE_ACCOUNT="${RUNTIME_SA}",_BUILD_SERVICE_ACCOUNT="${BUILD_SA}",_NEXT_PUBLIC_BASE_URL="${PUBLIC_DOMAIN}",_NEXT_PUBLIC_APP_URL="${PUBLIC_DOMAIN}",_BETTER_AUTH_URL="${PUBLIC_DOMAIN}",_ADMIN_APP_URL="${ADMIN_DOMAIN}",_NEXT_PUBLIC_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY}",_DATABASE_URL_SECRET_VERSION=1,_BETTER_AUTH_SECRET_VERSION=1,_ENCRYPTION_KEY_SECRET_VERSION=1,_CRON_SECRET_VERSION=1,_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION=1,_R2_ACCOUNT_ID_SECRET_VERSION=1,_R2_ACCESS_KEY_ID_SECRET_VERSION=1,_R2_SECRET_ACCESS_KEY_SECRET_VERSION=1,_R2_BUCKET_NAME_SECRET_VERSION=1,_R2_PUBLIC_URL_SECRET_VERSION=1,_CLOUDFLARE_ZONE_ID_SECRET_VERSION=1,_CLOUDFLARE_API_TOKEN_SECRET_VERSION=1,_GOOGLE_CLIENT_ID_SECRET_VERSION=1,_GOOGLE_CLIENT_SECRET_SECRET_VERSION=1
```

`cloudbuild.yaml` intentionally has no defaults for production-only
substitutions such as `_IAP_JWT_AUDIENCE`, the four
`_ADMIN_ROLE_GROUP_*_EMAIL` values, `_NEXT_PUBLIC_BASE_URL`,
`_NEXT_PUBLIC_APP_URL`, `_ADMIN_APP_URL`, and
`_NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Missing values fail at Cloud Build submit
time, and explicit empty values are rejected by the first
`validate-production-substitutions` step before any image build or push.

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
Federation (WIF), then submits the existing `cloudbuild.yaml`. This keeps
GitHub as the merge event source while avoiding service account keys and the
Cloud Build GitHub repository connection as a production dependency.

The workflow triggers on every push to `main`, plus explicit
`workflow_dispatch`. Do not add `paths` or `paths-ignore` filters to the
production deploy workflow; file-path filters make post-merge production
deployment conditional and reintroduce ambiguity about whether a merge should
deploy.

Do not create Cloud Build native triggers for production. That includes
`deploy-main`, console-created GitHub triggers, and manual
`gcloud builds triggers run`. Native triggers have their own trigger service
account path; this repository's production path is the GitHub WIF principal
impersonating `$BUILD_SA` and then calling `gcloud builds submit`.

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
sets up `gcloud`, and runs `gcloud builds submit` with the fixed production
substitutions and Secret Manager version `1` values.

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
not pass `--iap` and does not require project-level `roles/iap.admin`.

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

## Cloud Scheduler

The current app validates cron calls with `Authorization: Bearer $CRON_SECRET`.
Set up jobs after the service URL is stable:

```bash
PROJECT_ID="$PROJECT_ID" \
SERVICE_URL="$PUBLIC_DOMAIN" \
REGION="$REGION" \
bash scripts/setup-cloud-scheduler.sh
```

Future hardening option: replace the shared bearer secret with Cloud Scheduler
OIDC and app-side Google token verification. Do that as a separate code change,
because the current route handlers intentionally fail closed on `CRON_SECRET`.

## Production verification

Run these checks after deployment:

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="yaml(status.url,spec.template.spec.serviceAccountName,spec.template.metadata.annotations)"

gcloud run services describe "$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --format="yaml(status.url,spec.template.spec.serviceAccountName,spec.template.metadata.annotations)"

gcloud run jobs execute prisma-migrate --region="$REGION" --wait

curl -fsS "${PUBLIC_DOMAIN}/api/live"
curl -fsS "${PUBLIC_DOMAIN}/api/health"
curl -I "${PUBLIC_DOMAIN}/admin"
curl -I "${ADMIN_DOMAIN}/admin"

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
GITHUB_REPOSITORY="$GITHUB_REPOSITORY" \
GITHUB_REPOSITORY_ID="$GITHUB_REPOSITORY_ID" \
GITHUB_REPOSITORY_OWNER_ID="$GITHUB_REPOSITORY_OWNER_ID" \
WIF_POOL_ID="$WIF_POOL_ID" \
WIF_PROVIDER_ID="$WIF_PROVIDER_ID" \
bun run gcp:audit-production-iap
```

Expected results:

- `/api/live` returns 200;
- `/api/health` returns 200 only when DB and dependencies are healthy;
- `${PUBLIC_DOMAIN}/admin` returns 404 from `APP_SURFACE=public`;
- `${ADMIN_DOMAIN}/admin` redirects unauthenticated visitors to Google/IAP;
- with an IAP-allowed Google account in exactly one admin role group, `/admin`
  opens the dashboard and auto-syncs the local staff record without an app
  password form;
- `.github/workflows/deploy-production.yml` starts on every `main` push and the
  Cloud Build it submits succeeds;
- Cloud Logging shows `x-cloud-trace-context` correlation for requests.
- `bun run gcp:audit-production-iap` passes. The audit check
  `production HTTP domains are canonical HTTPS URLs` verifies URL shape before
  checking `/api/live`, `/api/health`, public `/admin` hiding, and
  `admin /admin redirects unauthenticated visitors to Google/IAP`. If it fails
  on Organization, Cloud Identity group, individual IAP grants, WIF,
  user-managed service account key absence, project-level
  `roles/iam.serviceAccountUser`, project-level
  `roles/iam.workloadIdentityUser`, project-level `roles/run.admin` for
  `$BUILD_SA`, project-level `roles/iap.admin` for `$BUILD_SA`, individual
  build service account `actAs` grants, legacy Cloud Build
  triggers/connections, or live HTTP behavior, the admin site may be protected
  but the GCP posture is not the final production baseline.

## Current repository contract

The current `cloudbuild.yaml` already handles:

- Docker image build with Bun;
- Artifact Registry image push;
- dedicated migrator image;
- Cloud Run Job update and execution for `prisma migrate deploy`;
- public and admin Cloud Run deploys with service account, probes, env vars,
  and secrets. Recurring deploys do not mutate admin IAP.
- fail-fast validation for admin `IAP_JWT_AUDIENCE` and the four admin role
  group emails. Initial `SUPER_ADMIN` creation is synced from the super-admin
  Google Group on first access, not bootstrapped from app env.

The current GCP-side production posture is:

1. project `myrrh-rental-space` is under organization `844678510879`;
2. Cloud Identity domain `myrrh-jp.com` owns the four admin role groups
   `myrrh-super-admins@myrrh-jp.com`, `myrrh-admins@myrrh-jp.com`,
   `myrrh-editors@myrrh-jp.com`, and `myrrh-viewers@myrrh-jp.com`;
3. `.github/workflows/deploy-production.yml` is the only production
   auto-deploy workflow;
4. native Cloud Build triggers and Cloud Build GitHub repository connections
   are absent;
5. `$BUILD_SA` has project-level `roles/cloudbuild.builds.builder` and
   `roles/logging.logWriter`, but no project-level `roles/run.admin` or
   `roles/iap.admin`;
6. `bun run gcp:audit-production-iap` is the gate for proving the posture is
   still clean after infrastructure changes.
