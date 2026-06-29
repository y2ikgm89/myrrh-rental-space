# GCP production setup

This document is the production setup runbook for Myrrh Rental Space on Google
Cloud. It follows the current Google Cloud recommendations that matter for this
repository:

- use user-managed service accounts instead of default service accounts;
- store secrets in Secret Manager and grant access only to the runtime identity;
- deploy containers to Cloud Run from Artifact Registry;
- run Prisma migrations as a Cloud Run Job before deploying the web service;
- protect admin traffic with Identity-Aware Proxy (IAP) and Google accounts;
- keep public pages reachable without letting direct Cloud Run URLs bypass the
  intended edge.

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
- IAP IAM:
  <https://cloud.google.com/iap/docs/managing-access>

## Target architecture

Do not enable IAP directly on the current single Cloud Run service if public
pages must stay public. Cloud Run service-level IAP protects the entire service.
For this application the clean production target is:

- one public Cloud Run backend for public routes;
- one admin Cloud Run backend for admin routes;
- an external HTTPS Application Load Balancer in front of both backends;
- IAP enabled only on the admin backend;
- Cloud Run ingress restricted to `internal-and-cloud-load-balancing` so the
  `*.run.app` URL cannot bypass the load balancer;
- a Google Group or Workspace/Cloud Identity group granted
  `roles/iap.httpsResourceAccessor` for admin access.

Recommended host/path layout:

- `https://example.com/*` -> public backend
- `https://example.com/admin` -> admin backend with IAP
- `https://example.com/admin/*` -> admin backend with IAP
- `https://example.com/admin/api/*` -> admin backend with IAP
- `https://example.com/api/auth/*` -> admin Better Auth backend with IAP
- `https://example.com/api/instagram/oauth/*` -> admin backend with IAP
- `https://example.com/api/google-business-profile/oauth/*` -> admin backend
  with IAP
- `https://example.com/preview/*` -> admin backend with IAP

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
export REGION="asia-northeast1"
export SERVICE_NAME="myrrh-rental-space"
export AR_REPOSITORY="myrrh-rental-space"
export PUBLIC_DOMAIN="https://example.com"
export APP_DOMAIN="https://example.com"
export RUNTIME_SA="myrrh-run@${PROJECT_ID}.iam.gserviceaccount.com"
export BUILD_SA="myrrh-build@${PROJECT_ID}.iam.gserviceaccount.com"
export IAP_ADMIN_GROUP="group:myrrh-admins@example.com"
```

`PUBLIC_DOMAIN` and `APP_DOMAIN` must not have a trailing slash because the app
concatenates paths directly.

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
  compute.googleapis.com \
  iam.googleapis.com
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
gcloud iam service-accounts create myrrh-run \
  --display-name="Myrrh Cloud Run runtime"

gcloud iam service-accounts create myrrh-build \
  --display-name="Myrrh Cloud Build deployer"
```

Grant the build identity only the deployment permissions it needs:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/logging.logWriter"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"
```

Do not create or download service account keys.

## Secret Manager

Create required secrets. Do not paste secret values into commit history or shell
history. Use stdin from a secure local prompt or your password manager.

Required by production startup:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `ADMIN_LOGIN_TOKEN`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Required when Cloudflare cache purge is enabled:

- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`

Create each secret once:

```bash
for name in \
  DATABASE_URL \
  BETTER_AUTH_SECRET \
  ENCRYPTION_KEY \
  CRON_SECRET \
  ADMIN_LOGIN_TOKEN \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_BUCKET_NAME \
  R2_PUBLIC_URL \
  CLOUDFLARE_ZONE_ID \
  CLOUDFLARE_API_TOKEN
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
  ADMIN_LOGIN_TOKEN \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY \
  R2_BUCKET_NAME \
  R2_PUBLIC_URL \
  CLOUDFLARE_ZONE_ID \
  CLOUDFLARE_API_TOKEN
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
openssl rand -base64 32   # BETTER_AUTH_SECRET, CRON_SECRET, ADMIN_LOGIN_TOKEN
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

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --substitutions=_REGION="${REGION}",_SERVICE_NAME="${SERVICE_NAME}",_REPOSITORY="${AR_REPOSITORY}",_SERVICE_ACCOUNT="${RUNTIME_SA}",_NEXT_PUBLIC_BASE_URL="${PUBLIC_DOMAIN}",_NEXT_PUBLIC_APP_URL="${APP_DOMAIN}",_BETTER_AUTH_URL="${APP_DOMAIN}"
```

After the first successful deploy, prefer fixed Secret Manager versions for
production rollouts. Update the `_..._SECRET_VERSION` substitutions in the Cloud
Build trigger when rotating a secret. Avoid `latest` in production deploy
triggers because it makes rollbacks ambiguous.

## Cloud Run service settings

For a load-balancer-fronted production service, configure both public and admin
Cloud Run services with:

```bash
gcloud run services update SERVICE_NAME \
  --region="$REGION" \
  --ingress=internal-and-cloud-load-balancing
```

This prevents users from bypassing the load balancer through the direct
`*.run.app` URL.

Use the runtime service account:

```bash
gcloud run services update SERVICE_NAME \
  --region="$REGION" \
  --service-account="$RUNTIME_SA"
```

Keep `/api/live` as the startup and liveness probe path. It is intentionally DB
independent. Use `/api/health` only for manual or uptime checks that are allowed
to touch dependencies.

## IAP admin access

Grant admin users through a Google Group, not individual users:

```bash
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service=ADMIN_BACKEND_SERVICE_NAME \
  --member="$IAP_ADMIN_GROUP" \
  --role="roles/iap.httpsResourceAccessor"
```

Operational rule:

- staff should use Google accounts;
- a non-Gmail address is fine only if it is a Google account or managed through
  Google Workspace / Cloud Identity;
- do not grant `allUsers` or `allAuthenticatedUsers` to the IAP admin backend;
- remove users by removing them from the Google Group.

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

gcloud run jobs execute prisma-migrate --region="$REGION" --wait

curl -fsS "${PUBLIC_DOMAIN}/api/live"
curl -fsS "${PUBLIC_DOMAIN}/api/health"
curl -I "${PUBLIC_DOMAIN}/admin/login"
```

Expected results:

- `/api/live` returns 200;
- `/api/health` returns 200 only when DB and dependencies are healthy;
- `/admin/login` is not publicly reachable without IAP and the app admin gate;
- Cloud Run direct `*.run.app` URL is not reachable from the public internet
  when ingress is restricted to the load balancer;
- Cloud Logging shows `x-cloud-trace-context` correlation for requests.

## Current repository contract

The current `cloudbuild.yaml` already handles:

- Docker image build with Bun;
- Artifact Registry image push;
- dedicated migrator image;
- Cloud Run Job update and execution for `prisma migrate deploy`;
- Cloud Run deploy with service account, probes, env vars, and secrets.

The remaining GCP-side production tasks are:

1. create the actual GCP project resources listed above;
2. create and grant Secret Manager secrets;
3. create the Application Load Balancer and backend routing;
4. enable IAP only for the admin backend;
5. create a Cloud Build trigger with required substitutions and fixed secret
   versions;
6. run the production verification checks.
