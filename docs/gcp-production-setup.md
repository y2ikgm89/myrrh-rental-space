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

## Target architecture

Cloud Run service-level IAP protects an entire service. Do not enable IAP on
the public service. The clean production target is:

- one public Cloud Run service for public routes, deployed with
  `APP_SURFACE=public` and `--allow-unauthenticated`;
- one admin Cloud Run service for admin routes, deployed with
  `APP_SURFACE=admin`, `--no-allow-unauthenticated`, and `--iap`;
- a Google Workspace / Cloud Identity security group granted
  `roles/iap.httpsResourceAccessor` for admin access;
- no individual user grants on the IAP-secured admin resource.

For production, do not treat an orgless Google Cloud project as the final
state. Google Cloud Run direct IAP can protect an orgless project after the
required console OAuth setup, but this repository's production baseline is
stricter: the final admin site must run in a project under the configured
Google Cloud Organization. An orgless project is only a temporary bootstrap
environment.

Recommended host/path layout:

- `https://example.com/*` -> public service
- `https://myrrh-rental-space-admin-...run.app/admin` -> admin service with IAP
- `https://myrrh-rental-space-admin-...run.app/admin/*` -> admin service with IAP
- `https://myrrh-rental-space-admin-...run.app/admin/api/*` -> admin service
  with IAP
- `https://myrrh-rental-space-admin-...run.app/api/instagram/oauth/*` -> admin
  service with IAP
- `https://myrrh-rental-space-admin-...run.app/api/google-business-profile/oauth/*`
  -> admin service with IAP
- `https://myrrh-rental-space-admin-...run.app/preview/*` -> admin service with
  IAP

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
export PROJECT_ID="your-gcp-project-id"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export GCP_ORGANIZATION_ID="123456789012"
export CLOUD_IDENTITY_DOMAIN="example.com"
export REGION="asia-northeast1"
export SERVICE_NAME="myrrh-rental-space"
export ADMIN_SERVICE_NAME="myrrh-rental-space-admin"
export AR_REPOSITORY="myrrh-rental-space"
export PUBLIC_DOMAIN="https://example.com"
export ADMIN_DOMAIN="https://myrrh-rental-space-admin-...run.app"
export TURNSTILE_SITE_KEY="0x..."
export MIGRATE_JOB_NAME="prisma-migrate"
export RUNTIME_SA="myrrh-rental-space-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export BUILD_SA="myrrh-rental-space-build@${PROJECT_ID}.iam.gserviceaccount.com"
export GITHUB_REPOSITORY="y2ikgm89/myrrh-rental-space"
export GITHUB_REPOSITORY_ID="1128842422"
export GITHUB_REPOSITORY_OWNER_ID="69025248"
export WIF_POOL_ID="github-actions"
export WIF_PROVIDER_ID="github-myrrh-rental-space"
export IAP_ADMIN_GROUP="group:myrrh-admins@example.com"
export INITIAL_ADMIN_EMAIL="owner@example.com"
export INITIAL_ADMIN_NAME="Owner"
export IAP_JWT_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${ADMIN_SERVICE_NAME}"
```

`PUBLIC_DOMAIN` and `ADMIN_DOMAIN` must not have a trailing slash because the
app concatenates paths directly.

`INITIAL_ADMIN_EMAIL` is the first `SUPER_ADMIN` app user. Use the same Google
account that will be allowed through IAP. `IAP_JWT_AUDIENCE` must match the
Cloud Run IAP signed-header audience format:
`/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME`.

`GCP_ORGANIZATION_ID` is required for production verification. The audit does
not infer or accept any organization; it must match this exact ID.

`IAP_ADMIN_GROUP` must be a `group:` member backed by Cloud Identity or Google
Workspace, for example `group:myrrh-admins@example.com`. Do not set it to a
personal `user:` identity for production, and do not omit the `group:` prefix.

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
4. Create a Cloud Identity security group for admin access:

```bash
gcloud identity groups create "${IAP_ADMIN_GROUP#group:}" \
  --organization="$CLOUD_IDENTITY_DOMAIN" \
  --group-type="security" \
  --display-name="Myrrh Rental Space Admins" \
  --description="Users allowed to access the Myrrh Rental Space IAP admin service" \
  --with-initial-owner="$INITIAL_ADMIN_EMAIL"
```

Add administrators and staff to the group:

```bash
gcloud identity groups memberships add \
  --group-email="${IAP_ADMIN_GROUP#group:}" \
  --member-email="$INITIAL_ADMIN_EMAIL" \
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
  iamcredentials.googleapis.com \
  sts.googleapis.com \
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

gcloud run jobs add-iam-policy-binding "$MIGRATE_JOB_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/storage.objectViewer"
```

Do not create or download service account keys.

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

gcloud builds triggers list \
  --format="table(name,id,disabled,serviceAccount)"
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
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
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

The repository already has `cloudbuild.yaml`. For production, run Cloud Build
with required substitutions instead of relying on defaults:

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
  --substitutions=SHORT_SHA="${SHORT_SHA}",_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_ADMIN_SERVICE_NAME="${ADMIN_SERVICE_NAME}",_IAP_JWT_AUDIENCE="${IAP_JWT_AUDIENCE}",_INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL}",_INITIAL_ADMIN_NAME="${INITIAL_ADMIN_NAME}",_REPOSITORY="${AR_REPOSITORY}",_WORKER_POOL="myrrh-deploy-pool",_SERVICE_ACCOUNT="${RUNTIME_SA}",_BUILD_SERVICE_ACCOUNT="${BUILD_SA}",_NEXT_PUBLIC_BASE_URL="${PUBLIC_DOMAIN}",_NEXT_PUBLIC_APP_URL="${PUBLIC_DOMAIN}",_BETTER_AUTH_URL="${PUBLIC_DOMAIN}",_ADMIN_APP_URL="${ADMIN_DOMAIN}"
```

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
production rollouts. Update the `_..._SECRET_VERSION` substitutions in the Cloud
Build trigger when rotating a secret. Avoid `latest` in production deploy
triggers because it makes rollbacks ambiguous.

## Cloud Build production trigger

Production auto-deploy uses GitHub Actions with Google Workload Identity
Federation (WIF), then submits the existing `cloudbuild.yaml`. This keeps
GitHub as the merge event source while avoiding service account keys and the
Cloud Build GitHub repository connection as a production dependency.

Do not create a pull-request deploy trigger. PR validation belongs in
`.github/workflows/ci.yml`; production deploys only after code reaches `main`.

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
production deploy trigger. It authenticates with `google-github-actions/auth`,
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
gcloud iap web add-iam-policy-binding \
  --resource-type=cloud-run \
  --service="$ADMIN_SERVICE_NAME" \
  --region="$REGION" \
  --member="$IAP_ADMIN_GROUP" \
  --role="roles/iap.httpsResourceAccessor" \
  --condition=None
```

Operational rule:

- staff should use Google accounts;
- a non-Gmail address is fine only if it is a Google account or managed through
  Google Workspace / Cloud Identity;
- do not grant `allUsers` or `allAuthenticatedUsers` to the admin service;
- do not grant `roles/iap.httpsResourceAccessor` directly to `user:*` members
  in production;
- add staff by creating the staff user in `/admin/users/new`, adding the same
  Google account to the IAP Google Group, then sending the access guide email;
- remove users by removing them from the Google Group and disabling/deleting
  the app staff user.

When migrating from a bootstrap individual grant, do this in order:

1. grant `roles/iap.httpsResourceAccessor` to `$IAP_ADMIN_GROUP`;
2. confirm a member of that group can open `${ADMIN_DOMAIN}/admin`;
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
REGION="$REGION" \
SERVICE_NAME="$SERVICE_NAME" \
ADMIN_SERVICE_NAME="$ADMIN_SERVICE_NAME" \
IAP_ADMIN_GROUP="$IAP_ADMIN_GROUP" \
bun run gcp:audit-production-iap
```

Expected results:

- `/api/live` returns 200;
- `/api/health` returns 200 only when DB and dependencies are healthy;
- `${PUBLIC_DOMAIN}/admin` returns 404 from `APP_SURFACE=public`;
- `${ADMIN_DOMAIN}/admin` redirects unauthenticated visitors to Google/IAP;
- with an IAP-allowed Google account and matching app staff user, `/admin`
  opens the dashboard without an app password form;
- `.github/workflows/deploy-production.yml` starts on `main` pushes that include
  application/deploy files and the Cloud Build it submits succeeds;
- Cloud Logging shows `x-cloud-trace-context` correlation for requests.
- `bun run gcp:audit-production-iap` passes. If it fails on Organization or
  individual IAP grants, the admin site is protected but the GCP posture is not
  the final production baseline.

## Current repository contract

The current `cloudbuild.yaml` already handles:

- Docker image build with Bun;
- Artifact Registry image push;
- dedicated migrator image;
- Cloud Run Job update and execution for `prisma migrate deploy`;
- public and admin Cloud Run deploys with service account, probes, env vars,
  secrets, and admin IAP.
- fail-fast validation for admin `IAP_JWT_AUDIENCE` and
  `INITIAL_ADMIN_EMAIL`, plus initial `SUPER_ADMIN` bootstrap on the admin
  service.

The remaining GCP-side production tasks are:

1. create or cut over to an Organization-backed GCP project;
2. create and grant Secret Manager secrets;
3. create WIF pool/provider and keep `.github/workflows/deploy-production.yml`
   as the only production auto-deploy trigger;
4. grant IAP access to the admin Google Group and remove individual IAP grants;
5. run `bun run gcp:audit-production-iap`;
6. run the production verification checks.
