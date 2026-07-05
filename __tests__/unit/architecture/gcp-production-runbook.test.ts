import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { getExpectedWifProviderCondition } from "../../../scripts/gcp-production-audit-model";

const runbook = readFileSync(
  join(process.cwd(), "docs", "gcp-production-setup.md"),
  "utf8",
);
const adminAccessRunbook = readFileSync(
  join(process.cwd(), "docs", "admin-access.md"),
  "utf8",
);

describe("GCP production setup runbook", () => {
  test("uses concrete production identifiers for non-secret required variables", () => {
    expect(runbook).toContain('export PROJECT_ID="myrrh-rental-space"');
    expect(runbook).toContain('export GCP_ORGANIZATION_ID="844678510879"');
    expect(runbook).toContain('export CLOUD_IDENTITY_DOMAIN="myrrh-jp.com"');
    expect(runbook).toContain(
      'export PUBLIC_DOMAIN="https://rental-space.myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_DOMAIN="https://admin.myrrh-jp.com"',
    );
    expect(runbook).toContain('export ADMIN_LB_IP="8.233.111.15"');
    expect(runbook).toContain('export ADMIN_LB_IPV6="2600:1901:0:6b8e::"');
    expect(runbook).toContain(
      'export TURNSTILE_SITE_KEY="0x4AAAAAADi6Bqavj97fu7JG"',
    );
    expect(runbook).toContain(
      'export GITHUB_REPOSITORY="y2ikgm89/myrrh-rental-space"',
    );
    expect(runbook).toContain('export GITHUB_REPOSITORY_ID="1128842422"');
    expect(runbook).toContain('export GITHUB_REPOSITORY_OWNER_ID="69025248"');
    expect(runbook).toContain('export AR_REPOSITORY="myrrh-rental-space"');
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="myrrh-super-admins@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_ADMIN_EMAIL="myrrh-admins@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_EDITOR_EMAIL="myrrh-editors@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_VIEWER_EMAIL="myrrh-viewers@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export PRIMARY_ADMIN_EMAIL="admin@myrrh-jp.com"',
    );
    expect(runbook).not.toContain("export INITIAL_ADMIN_EMAIL");
    expect(runbook).not.toContain("export INITIAL_ADMIN_NAME");
  });

  test("does not keep generic production identifier placeholders", () => {
    expect(runbook).not.toContain("your-gcp-project-id");
    expect(runbook).not.toContain("123456789012");
    expect(runbook).not.toContain("example.com");
    expect(runbook).not.toContain("owner@example.com");
    expect(runbook).not.toContain("myrrh-admins@example.com");
    expect(runbook).not.toContain("https://example.com");
  });

  test("admin access audit command pins the GitHub WIF repository identity", () => {
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY = "y2ikgm89/myrrh-rental-space"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY_ID = "1128842422"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY_OWNER_ID = "69025248"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:WIF_PROVIDER_ID = "github-myrrh-rental-space"',
    );
    expect(runbook).toContain('GITHUB_REPOSITORY="$GITHUB_REPOSITORY"');
    expect(runbook).toContain('GITHUB_REPOSITORY_ID="$GITHUB_REPOSITORY_ID"');
    expect(runbook).toContain(
      'GITHUB_REPOSITORY_OWNER_ID="$GITHUB_REPOSITORY_OWNER_ID"',
    );
    expect(runbook).toContain('AR_REPOSITORY="$AR_REPOSITORY"');
    expect(adminAccessRunbook).toContain(
      '$env:AR_REPOSITORY = "myrrh-rental-space"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:MIGRATE_JOB_NAME = "prisma-migrate"',
    );
  });

  test("production audit commands include the canonical public and admin domains", () => {
    expect(adminAccessRunbook).toContain(
      '$env:PUBLIC_DOMAIN = "https://rental-space.myrrh-jp.com"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:ADMIN_DOMAIN = "https://admin.myrrh-jp.com"',
    );
    expect(runbook).toContain('PUBLIC_DOMAIN="$PUBLIC_DOMAIN"');
    expect(runbook).toContain('ADMIN_DOMAIN="$ADMIN_DOMAIN"');
    expect(runbook).toContain(
      "production HTTP domains are canonical HTTPS URLs",
    );
    expect(runbook).toContain("The production audit rejects any other host");
    expect(runbook).toContain("lookalike domains");
    expect(runbook).toContain("private IP literals");
    expect(runbook).toContain("myrrh-admin-lb-ip");
    expect(runbook).toContain("myrrh-admin-lb-ipv6");
    expect(runbook).toContain("myrrh-admin-https-rule-ipv6");
    expect(runbook).toContain("myrrh-admin-cert-20260705");
    expect(runbook).toContain("admin.myrrh-jp.com -> 8.233.111.15");
    expect(runbook).toContain("admin.myrrh-jp.com -> 2600:1901:0:6b8e::");
    expect(runbook).toContain("proxied=false");
    expect(runbook).toContain("DNS read/edit permission");
    expect(runbook).toContain(
      "admin root redirects unauthenticated visitors to Google/IAP",
    );
    expect(runbook).toContain(
      "admin /admin redirects unauthenticated visitors to Google/IAP",
    );
  });

  test("documents Cloud Run IAP audit as official REST API based", () => {
    expect(runbook).toContain("official IAP REST API");
    expect(runbook).toContain(
      "iap_web/cloud_run-${REGION}/services/${ADMIN_SERVICE_NAME}:getIamPolicy",
    );
    expect(runbook).toContain(
      "does not depend on local `gcloud iap web --resource-type=cloud-run` support",
    );
    expect(adminAccessRunbook).toContain("official IAP REST API");
    expect(adminAccessRunbook).toContain(
      "does not depend on local `gcloud iap web --resource-type=cloud-run` support",
    );
  });

  test("documents GCLOUD_BIN for local gcloud installations outside PATH", () => {
    expect(adminAccessRunbook).toContain("GCLOUD_BIN");
    expect(adminAccessRunbook).toContain(
      '$env:GCLOUD_BIN = "$env:LOCALAPPDATA\\google-cloud-sdk\\bin\\gcloud.cmd"',
    );
    expect(runbook).toContain("GCLOUD_BIN");
    expect(runbook).toContain("gcloud executable");
  });

  test("documents non-interactive gcloud auth preflight before live production audit", () => {
    expect(runbook).toContain("gcloud auth print-access-token");
    expect(runbook).toContain("cannot prompt during non-interactive execution");
  });

  test("production verification variable list includes the full WIF identity", () => {
    expect(runbook).toContain(
      "`GCP_ORGANIZATION_ID`, `CLOUD_IDENTITY_DOMAIN`, `GITHUB_REPOSITORY`,",
    );
    expect(runbook).toContain(
      "`GITHUB_REPOSITORY_ID`, `GITHUB_REPOSITORY_OWNER_ID`, `RUNTIME_SA`,",
    );
    expect(runbook).toContain("`BUILD_SA`, `AR_REPOSITORY`, `WIF_POOL_ID`");
  });

  test("production audit runbook verifies Cloud Scheduler OIDC posture", () => {
    expect(runbook).toContain('CRON_SERVICE_ACCOUNT_EMAIL="$SCHEDULER_SA"');
    expect(runbook).toContain(
      "Cloud Scheduler cron jobs use Google OIDC tokens only",
    );
    expect(runbook).toContain(
      "scheduler service account has no user-managed keys",
    );
    expect(runbook).toContain("old `Authorization: Bearer` cron secrets");
  });

  test("production audit runbook verifies canonical Cloud Run runtime env", () => {
    expect(runbook).toContain("public Cloud Run runtime env is canonical");
    expect(runbook).toContain("admin Cloud Run runtime env is canonical");
    expect(runbook).toContain("Cloud Run service ingress is canonical");
    expect(runbook).toContain("`--ingress=all`");
    expect(runbook).toContain("`--ingress=internal-and-cloud-load-balancing`");
    expect(runbook).toContain("`--no-default-url`");
    expect(runbook).toContain(
      "admin Cloud Run default run.app URL is disabled",
    );
    expect(runbook).toContain("Cloud Run service identities are dedicated");
    expect(runbook).toContain("Cloud Run migrate Job identity is dedicated");
    expect(runbook).toContain("Cloud Run migrate Job env is canonical");
    expect(runbook).toContain("Cloud Run migrate Job command is canonical");
    expect(runbook).toContain(
      "Cloud Run migrate Job execution config is canonical",
    );
    expect(runbook).toContain("`BETTER_AUTH_URL`");
    expect(runbook).toContain("required Secret Manager versions are enabled");
    expect(runbook).toContain(
      "required Secret Manager accessor IAM is least privilege",
    );
    expect(runbook).toContain(
      "project IAM has no broad Secret Manager accessor grants",
    );
    expect(runbook).toContain("`gcloud secrets versions describe`");
    expect(runbook).toContain("`gcloud secrets get-iam-policy`");
    expect(runbook).toContain("`state=ENABLED`");
    expect(runbook).toContain(
      "Turnstile's secret key is managed from the admin settings page",
    );
    expect(runbook).toContain("CLOUDFLARE_ORIGIN_HEADER_SECRET");
    expect(runbook).toContain("x-cloudflare-origin-secret");
    expect(runbook).toMatch(/default Cloud Build\s+service account/);
  });

  test("production audit runbook verifies resource-level deploy IAM grants", () => {
    expect(runbook).toContain(
      "Artifact Registry repository writer is limited to build service account",
    );
    expect(runbook).toContain(
      "Cloud Run deploy admin grants are limited to build service account",
    );
    expect(runbook).toContain(
      "runtime service account actAs grant is limited to build service account",
    );
    expect(runbook).toContain(
      "runtime service account tokenCreator grants are absent",
    );
    expect(runbook).toContain(
      "Cloud Build source bucket objectViewer is limited to build service account",
    );
    expect(runbook).toContain("`gcloud artifacts repositories get-iam-policy`");
    expect(runbook).toContain("`gcloud run services get-iam-policy`");
    expect(runbook).toContain("`gcloud run jobs get-iam-policy`");
    expect(runbook).toContain("`gcloud iam service-accounts get-iam-policy`");
    expect(runbook).toContain("`gcloud storage buckets get-iam-policy`");
    expect(runbook).toContain(
      "project-level `roles/iam.serviceAccountTokenCreator` grants must remain absent",
    );
  });

  test("production audit runbook verifies Cloud Run revision health", () => {
    expect(runbook).toContain("public Cloud Run revisions are healthy");
    expect(runbook).toContain("admin Cloud Run revisions are healthy");
    expect(runbook).toContain("gcloud run revisions delete");
    expect(runbook).toContain("traffic 0%");
    expect(runbook).toContain("not the latest ready revision");
  });

  test("production audit runbook rejects legacy Cloud Run runtime env names", () => {
    expect(runbook).toContain("`--set-env-vars`");
    expect(runbook).toContain("`--set-secrets`");
    expect(runbook).toContain(
      "legacy `--update-*` / `--remove-*` drift cleanup",
    );
    expect(runbook).toContain("`CRON_SECRET`");
    expect(runbook).toContain("`ADMIN_LOGIN_TOKEN`");
    expect(runbook).toContain("`INITIAL_ADMIN_EMAIL`");
    expect(runbook).toContain("`INITIAL_ADMIN_NAME`");
    expect(runbook).toMatch(/must be absent from Cloud Run\s+runtime env/);
  });

  test("documents canonical public origin alignment for emergency Cloud Build submits", () => {
    expect(runbook).toMatch(
      /`_NEXT_PUBLIC_APP_URL`, `_BETTER_AUTH_URL`, and\s+`_CRON_OIDC_AUDIENCE` must match `_NEXT_PUBLIC_BASE_URL`/,
    );
    expect(runbook).toMatch(
      /the single production\s+image is built for the canonical public origin/,
    );
  });

  test("documents the image-baked Next Server Actions encryption key contract", () => {
    expect(runbook).toContain("openssl rand -base64 32");
    expect(runbook).toContain("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    expect(runbook).toContain("official Next.js self-hosting");
    expect(runbook).toContain("contract: it is a consistent base64-encoded");
    expect(runbook).toContain("records the effective key in the server");
    expect(runbook).toContain("rotate it only with a rebuild + redeploy");
  });

  test("pins Cloud Run migrate Job environment secrets to numeric versions", () => {
    expect(runbook).toContain("--set-secrets=DATABASE_URL=DATABASE_URL:1");
    expect(runbook).toContain("--command=bunx");
    expect(runbook).toContain("--args=--bun,prisma,migrate,deploy");
    expect(runbook).toContain("--tasks=1");
    expect(runbook).toContain("--parallelism=1");
    expect(runbook).toContain("--max-retries=0");
    expect(runbook).toContain("--task-timeout=600s");
    expect(runbook).toContain("--cpu=1");
    expect(runbook).not.toContain(
      "--set-secrets=DATABASE_URL=DATABASE_URL:latest",
    );
    expect(runbook).toContain(
      "Cloud Run resolves environment variable secrets at instance startup",
    );
  });

  test("documents that project-level deploy impersonation grants must stay absent", () => {
    expect(runbook).toContain(
      "project-level `roles/iam.serviceAccountUser` grants must remain absent",
    );
    expect(runbook).toContain(
      "project-level `roles/iam.workloadIdentityUser` grants must remain absent",
    );
  });

  test("documents current Cloud Identity group owner commands", () => {
    expect(runbook).toContain("--with-initial-owner=with-initial-owner");
    expect(runbook).toContain("gcloud identity groups memberships add");
    expect(runbook).toContain(
      "gcloud identity groups memberships modify-membership-roles",
    );
    expect(runbook).toContain("--add-roles=OWNER");
    expect(runbook).toContain(
      'for group_email in "$ADMIN_ROLE_GROUP_ADMIN_EMAIL" "$ADMIN_ROLE_GROUP_EDITOR_EMAIL" "$ADMIN_ROLE_GROUP_VIEWER_EMAIL"',
    );
    expect(runbook).toContain('--member-email="$PRIMARY_ADMIN_EMAIL"');
    expect(runbook).not.toContain(
      '--with-initial-owner="$PRIMARY_ADMIN_EMAIL"',
    );
    expect(runbook).not.toContain("--roles=OWNER || true");
    expect(runbook).not.toContain("--roles=OWNER");
  });

  test("native Cloud Build cleanup covers every official Cloud Build region", () => {
    expect(runbook).toContain("CLOUD_BUILD_REGIONS=(");
    expect(runbook).toContain("asia-northeast1");
    expect(runbook).toContain("us-central1");
    expect(runbook).toContain("europe-west1");
    expect(runbook).toContain("me-central2");
    expect(runbook).toContain(
      'for location in global "${CLOUD_BUILD_REGIONS[@]}"',
    );
    expect(runbook).toContain('for location in "${CLOUD_BUILD_REGIONS[@]}"');
  });

  test("does not document native Cloud Build triggers as the production deploy path", () => {
    expect(runbook).toContain(
      "Do not create Cloud Build native triggers for production",
    );
    expect(runbook).toContain(
      "this repository's production path is the GitHub WIF principal",
    );
    expect(runbook).toContain(
      "Remove any existing native Cloud Build triggers and Cloud Build repository",
    );
    expect(runbook).toContain(
      "Legacy Cloud Build cleanup reference, for auditing or deleting leftovers only",
    );
    expect(runbook).not.toContain("- `gcloud builds triggers run`:");
  });

  test("does not present stale Cloud Build trigger inventory as current proof", () => {
    expect(runbook).toContain(
      "Do not treat any previous Cloud Build trigger inventory as current proof",
    );
    expect(runbook).toContain(
      "If a native trigger such as `deploy-main` exists, delete it",
    );
    expect(runbook).toContain(
      "a fresh `bun run gcp:audit-production-iap` pass is the proof",
    );
    expect(runbook).not.toContain(
      "native Cloud Build triggers: 0 in all audited Cloud Build locations",
    );
  });

  test("describes production posture as audit-proven target state, not assumed live state", () => {
    expect(runbook).toContain("The audited production target posture is:");
    expect(runbook).toContain(
      "`bun run gcp:audit-production-iap` is the gate for proving the live posture",
    );
    expect(runbook).not.toContain(
      "The current GCP-side production posture is:",
    );
  });

  test("documents that individual build actAs grants are temporary break-glass only", () => {
    expect(runbook).toContain(
      "If an individual operator needs to run this emergency command",
    );
    expect(runbook).toContain(
      "temporary break-glass `roles/iam.serviceAccountUser` binding",
    );
    expect(runbook).toContain(
      "Remove that individual-user binding immediately after the deploy",
    );
    expect(runbook).toMatch(
      /the production audit treats individual-user build `actAs`\s+bindings as non-clean posture/,
    );
  });

  test("WIF provider command uses the same expected condition as the production audit", () => {
    const expectedCondition = getExpectedWifProviderCondition({
      repository: "${GITHUB_REPOSITORY}",
      repositoryId: "${GITHUB_REPOSITORY_ID}",
      repositoryOwnerId: "${GITHUB_REPOSITORY_OWNER_ID}",
    });

    expect(runbook).toContain(`--attribute-condition="${expectedCondition}"`);
  });
});
