import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const workflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
  "utf8",
);
const cloudBuildConfig = readFileSync(
  join(process.cwd(), "cloudbuild.yaml"),
  "utf8",
);
const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
const runbook = readFileSync(
  join(process.cwd(), "docs", "gcp-production-setup.md"),
  "utf8",
);
const serverEnvSource = readFileSync(
  join(process.cwd(), "src", "shared", "lib", "env", "server.ts"),
  "utf8",
);

const requiredProductionSubstitutions = [
  "_ADMIN_APP_URL",
  "_BETTER_AUTH_URL",
  "_IAP_JWT_AUDIENCE",
  "_ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
  "_ADMIN_ROLE_GROUP_ADMIN_EMAIL",
  "_ADMIN_ROLE_GROUP_EDITOR_EMAIL",
  "_ADMIN_ROLE_GROUP_VIEWER_EMAIL",
  "_NEXT_PUBLIC_APP_URL",
  "_NEXT_PUBLIC_BASE_URL",
  "_CRON_OIDC_AUDIENCE",
  "_CRON_SERVICE_ACCOUNT_EMAIL",
  "_NEXT_PUBLIC_TURNSTILE_SITE_KEY",
] as const;

function readWorkflowSubstitutionKeys(): string[] {
  const keys = new Set<string>();
  for (const match of workflow.matchAll(/SUBSTITUTIONS(?:\+)?=",?([^=]+)=/g)) {
    keys.add(match[1] ?? "");
  }
  return [...keys].filter((key) => key.length > 0).sort();
}

function readRunbookSubmitSubstitutionKeys(): string[] {
  const cloudBuildDeploySection =
    runbook.match(
      /## Cloud Build deploy(?<section>[\s\S]*?)`cloudbuild\.yaml` sets/,
    )?.groups?.["section"] ?? "";
  const substitutionsText =
    cloudBuildDeploySection.match(/--substitutions=(?<value>[^\n]+)/)?.groups?.[
      "value"
    ] ?? "";
  const keys = new Set<string>();
  for (const match of substitutionsText.matchAll(/(?:^|,)([A-Z0-9_]+)=/g)) {
    keys.add(match[1] ?? "");
  }
  return [...keys].filter((key) => key.length > 0).sort();
}

function readCloudBuildDefaultSubstitutionKeys(): string[] {
  const substitutionsSection =
    cloudBuildConfig.match(/^substitutions:\n(?<section>[\s\S]*?)^options:/m)
      ?.groups?.["section"] ?? "";
  const keys = new Set<string>();
  for (const match of substitutionsSection.matchAll(/^\s+(_[A-Z0-9_]+):/gm)) {
    keys.add(match[1] ?? "");
  }
  return [...keys].filter((key) => key.length > 0).sort();
}

function readCloudBuildReferencedUserSubstitutionKeys(): string[] {
  const keys = new Set<string>();
  for (const match of cloudBuildConfig.matchAll(/\$\{(_[A-Z0-9_]+)\}/g)) {
    keys.add(match[1] ?? "");
  }
  return [...keys].filter((key) => key.length > 0).sort();
}

/** HCL 行コメントを落としてから `ignore_changes` 配列の要素を取る。
 * ブロック内コメントに `traffic,` が残っているだけでは一致させない。 */
function ignoreChangesEntries(tfSource: string): string[] {
  const withoutComments = tfSource.replace(/#.*$/gmu, "");
  const start = withoutComments.search(/ignore_changes\s*=\s*\[/u);
  if (start < 0) return [];
  const open = withoutComments.indexOf("[", start);
  let depth = 0;
  for (let i = open; i < withoutComments.length; i += 1) {
    const ch = withoutComments[i];
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return withoutComments
          .slice(open + 1, i)
          .split("\n")
          .map((line) => line.trim().replace(/,$/u, "").trim())
          .filter((item) => item.length > 0);
      }
    }
  }
  return [];
}

function readUnsupportedCloudBuildDollarExpressions(): string[] {
  const supportedNames = new Set([
    "BUILD_ID",
    "PROJECT_ID",
    "PROJECT_NUMBER",
    "LOCATION",
    "SHORT_SHA",
  ]);
  const unsupported = new Set<string>();

  for (const match of cloudBuildConfig.matchAll(/\$\{([^}]+)\}/g)) {
    const expression = match[1] ?? "";
    if (/^_[A-Z0-9_]+$/u.test(expression)) continue;
    if (supportedNames.has(expression)) continue;
    unsupported.add(`\${${expression}}`);
  }

  for (const match of cloudBuildConfig.matchAll(
    /(?<!\$)\$([A-Za-z][A-Za-z0-9_]*)/g,
  )) {
    const expression = match[1] ?? "";
    if (supportedNames.has(expression)) continue;
    unsupported.add(`$${expression}`);
  }

  return [...unsupported].sort();
}

describe("production deploy workflow", () => {
  test("runs only via workflow_dispatch (no push-to-main auto deploy)", () => {
    expect(workflow).toContain("workflow_dispatch:");
    // push-to-main 自動デプロイはコスト / Neon wake 抑制のため廃止。
    expect(workflow).not.toMatch(/^on:\s*\n\s*push:/m);
    expect(workflow).not.toContain("paths-ignore:");
    expect(workflow).not.toContain("paths:");
    // 前回デプロイ済み image tag を breaking-migration base にする。
    expect(workflow).toContain("gcloud run services describe");
    expect(workflow).toContain("DEPLOYED_TAG");
  });

  test("uses GitHub WIF and submits Cloud Build directly", () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("google-github-actions/auth@");
    expect(workflow).toContain("workload_identity_provider:");
    expect(workflow).toContain("service_account:");
    expect(workflow).toContain("install_components: beta");
    expect(workflow).toContain("gcloud beta builds submit");
    expect(runbook).toContain("gcloud beta builds submit");
    expect(runbook).toContain("install_components: beta");
    expect(workflow).not.toContain("credentials_json");
    expect(workflow).not.toContain("gcloud builds triggers run");
  });

  test("keeps emergency gcloud submit substitutions in sync with the production workflow", () => {
    expect(readRunbookSubmitSubstitutionKeys()).toEqual(
      readWorkflowSubstitutionKeys(),
    );
  });

  test("resolves every Cloud Build user substitution from defaults or submit-time values", () => {
    const defaultKeys = readCloudBuildDefaultSubstitutionKeys();
    const workflowKeys = readWorkflowSubstitutionKeys();
    const runbookKeys = readRunbookSubmitSubstitutionKeys();
    const resolvableByWorkflow = new Set([...defaultKeys, ...workflowKeys]);
    const resolvableByRunbook = new Set([...defaultKeys, ...runbookKeys]);

    for (const key of readCloudBuildReferencedUserSubstitutionKeys()) {
      expect(resolvableByWorkflow.has(key), `${key} in workflow`).toBe(true);
      expect(resolvableByRunbook.has(key), `${key} in runbook`).toBe(true);
    }
  });

  test("escapes shell-only dollar expressions so Cloud Build does not parse them as substitutions", () => {
    expect(readUnsupportedCloudBuildDollarExpressions()).toEqual([]);
  });

  test("requires production substitutions at submit time instead of empty defaults", () => {
    const workflowKeys = readWorkflowSubstitutionKeys();
    const runbookKeys = readRunbookSubmitSubstitutionKeys();

    for (const key of requiredProductionSubstitutions) {
      expect(workflowKeys).toContain(key);
      expect(runbookKeys).toContain(key);
      expect(cloudBuildConfig).toContain(`\${${key}}`);
      expect(cloudBuildConfig).not.toContain(`${key}: ""`);
    }

    expect(cloudBuildConfig).toContain('_NEXT_PUBLIC_GA_MEASUREMENT_ID: ""');
    expect(cloudBuildConfig).not.toContain('_BETTER_AUTH_URL: ""');
  });

  test("validates explicit empty production substitutions before building images", () => {
    const validationStepIndex = cloudBuildConfig.indexOf(
      "id: validate-production-substitutions",
    );
    const buildStepIndex = cloudBuildConfig.indexOf("id: build-image");

    expect(validationStepIndex).toBeGreaterThanOrEqual(0);
    expect(validationStepIndex).toBeLessThan(buildStepIndex);

    const validationStep = cloudBuildConfig.slice(
      validationStepIndex,
      buildStepIndex,
    );
    for (const key of requiredProductionSubstitutions) {
      expect(validationStep).toContain(`\${${key}}`);
      expect(validationStep).toContain(`${key} is required`);
    }
  });

  test("requires a canonical Better Auth URL in production runtime env", () => {
    expect(serverEnvSource).toContain(
      "BETTER_AUTH_URL: noTrailingSlashUrl.optional()",
    );
    expect(serverEnvSource).toContain(
      '{ name: "BETTER_AUTH_URL", value: serverEnv.BETTER_AUTH_URL }',
    );
    expect(cloudBuildConfig).toContain("_BETTER_AUTH_URL is required");
    expect(cloudBuildConfig).toContain(
      "_BETTER_AUTH_URL must not end with a trailing slash",
    );
  });

  test("validates Cloud Run IAP audience format in production runtime env", () => {
    expect(serverEnvSource).toContain("cloudRunIapJwtAudience");
    expect(serverEnvSource).toContain(
      "IAP_JWT_AUDIENCE: cloudRunIapJwtAudience.optional()",
    );
    expect(serverEnvSource).toContain(
      "/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME",
    );
    expect(serverEnvSource).toContain("must match Cloud Run IAP audience");
    expect(serverEnvSource).not.toContain(
      "IAP_JWT_AUDIENCE: z.string().min(1)",
    );
  });

  test("requires the image-baked Next Server Actions encryption key in production runtime env", () => {
    expect(serverEnvSource).toContain("nextServerActionsEncryptionKey");
    expect(serverEnvSource).toContain("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:");
    expect(serverEnvSource).toContain(
      "nextServerActionsEncryptionKey.optional()",
    );
    expect(serverEnvSource).toContain(
      'process.env["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"]',
    );
    expect(serverEnvSource).toContain(
      'name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"',
    );
    expect(serverEnvSource).toContain(
      "serverEnv.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    );
    expect(serverEnvSource).toContain("base64-encoded AES key");
    expect(cloudBuildConfig).toContain("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    expect(runbook).toContain("openssl rand -base64 32");
  });

  test("keeps single-image public origin substitutions canonical", () => {
    expect(cloudBuildConfig).toContain(
      "_NEXT_PUBLIC_APP_URL must match _NEXT_PUBLIC_BASE_URL for the single production image",
    );
    expect(cloudBuildConfig).toContain(
      "_BETTER_AUTH_URL must match _NEXT_PUBLIC_BASE_URL for the public service",
    );
    expect(cloudBuildConfig).toContain(
      "_CRON_OIDC_AUDIENCE must match _NEXT_PUBLIC_BASE_URL",
    );
  });

  test("does not describe production Cloud Build substitutions as trigger-owned", () => {
    expect(cloudBuildConfig).not.toContain("production triggers");
    expect(cloudBuildConfig).not.toContain("trigger で必須");
    expect(cloudBuildConfig).not.toContain("trigger 未設定");
    expect(cloudBuildConfig).not.toContain("trigger / gcloud builds submit");
    expect(dockerfile).not.toContain("cloudbuild trigger");
    expect(dockerfile).not.toContain("trigger で substitution 設定");
    expect(runbook).toContain("## GitHub Actions production workflow");
    expect(runbook).not.toContain("## GitHub Actions production trigger");
  });

  test("does not mutate admin IAP during recurring Cloud Build deploys", () => {
    const deployAdminIndex = cloudBuildConfig.indexOf("id: deploy-admin");
    expect(deployAdminIndex).toBeGreaterThanOrEqual(0);
    const deployAdminStep = cloudBuildConfig.slice(deployAdminIndex);

    expect(deployAdminStep).not.toContain("--iap");
    expect(deployAdminStep).not.toContain("--no-allow-unauthenticated");
    expect(runbook).toContain(
      "IAP is enabled once during setup and then verified by the production audit",
    );
    expect(runbook).toContain("does not reapply `--no-allow-unauthenticated`");
    expect(runbook).toContain(
      'gcloud run services add-iam-policy-binding "$ADMIN_SERVICE_NAME"',
    );
    expect(runbook).toContain("roles/run.admin");
    expect(runbook).toContain(
      'gcloud projects remove-iam-policy-binding "$PROJECT_ID" \\',
    );
    expect(runbook).toContain('--role="roles/iap.admin"');
    expect(runbook).toContain('--role="roles/run.admin"');
  });

  test("Cloud Run shape/env/secrets は Terraform SSoT; CB は services update --image のみ", () => {
    // Phase 6b clean-break: official pattern is `gcloud run services update --image`
    // when Terraform owns configuration. CB also passes `--scaling=auto` so
    // breaking quiesce (`--scaling=0`) is cleared on the success path.
    const deployPublicIndex = cloudBuildConfig.indexOf("id: deploy-public");
    const deployAdminIndex = cloudBuildConfig.indexOf("id: deploy-admin");
    expect(deployPublicIndex).toBeGreaterThanOrEqual(0);
    expect(deployAdminIndex).toBeGreaterThan(deployPublicIndex);

    const deployPublicStep = cloudBuildConfig.slice(
      deployPublicIndex,
      deployAdminIndex,
    );
    const deployAdminStep = cloudBuildConfig.slice(deployAdminIndex);

    for (const step of [deployPublicStep, deployAdminStep]) {
      expect(step).toContain("services");
      expect(step).toContain("update");
      expect(step).toContain("--image=");
      expect(step).toContain("--scaling=auto");
      expect(step).not.toContain("\n      - deploy\n");
      expect(step).not.toContain("--set-env-vars=");
      expect(step).not.toContain("--set-secrets=");
      expect(step).not.toContain("--remove-env-vars=");
      expect(step).not.toContain("--update-env-vars=");
      expect(step).not.toContain("--remove-secrets=");
      expect(step).not.toContain("--update-secrets=");
      expect(step).not.toContain("--memory=");
      expect(step).not.toContain("--cpu=");
      expect(step).not.toContain("--concurrency=");
      expect(step).not.toContain("--timeout=");
      expect(step).not.toContain("--min-instances=");
      expect(step).not.toContain("--max-instances=");
      expect(step).not.toContain("--service-account=");
      expect(step).not.toContain("--execution-environment=");
      expect(step).not.toContain("--cpu-boost");
      expect(step).not.toContain("--no-cpu-throttling");
      expect(step).not.toContain("--port=");
      expect(step).not.toContain("--startup-probe=");
      expect(step).not.toContain("--liveness-probe=");
      expect(step).not.toContain("--allow-unauthenticated");
      expect(step).not.toContain("--ingress=");
      expect(step).not.toContain("--no-default-url");
      expect(step).not.toContain("CRON_SECRET=CRON_SECRET");
      expect(step).not.toContain("ADMIN_LOGIN_TOKEN=ADMIN_LOGIN_TOKEN");
    }

    // Unused shape substitutions must not remain (Cloud Build unmatched-key rule)
    expect(cloudBuildConfig).not.toMatch(/^\s+_MEMORY:/m);
    expect(cloudBuildConfig).not.toMatch(/^\s+_CPU:/m);
    expect(cloudBuildConfig).not.toMatch(/^\s+_SERVICE_ACCOUNT:/m);
    expect(workflow).not.toContain(
      "_SERVICE_ACCOUNT=${RUNTIME_SERVICE_ACCOUNT}",
    );

    const cloudRunPublicTf = readFileSync(
      join(process.cwd(), "terraform", "cloud_run_public.tf"),
      "utf8",
    );
    const cloudRunAdminTf = readFileSync(
      join(process.cwd(), "terraform", "cloud_run_admin.tf"),
      "utf8",
    );
    for (const tf of [cloudRunPublicTf, cloudRunAdminTf]) {
      expect(tf).toMatch(
        /dynamic\s+"env"[\s\S]*for_each\s*=\s*local\.cloud_run_/,
      );
      expect(tf).toMatch(
        /dynamic\s+"env"[\s\S]*for_each\s*=\s*var\.cloud_run_secret_versions/,
      );
      expect(tf).toMatch(
        /secret_key_ref[\s\S]*google_secret_manager_secret\.secret\[env\.key\]/,
      );
      expect(tf).not.toMatch(/ignore_changes[\s\S]*containers\[0\]\.env/);
      expect(tf).toContain('memory = "1Gi"');
      expect(tf).toContain('cpu    = "1"');
      expect(tf).toContain('path = "/api/live"');
    }
    expect(cloudRunPublicTf).toContain('ingress  = "INGRESS_TRAFFIC_ALL"');
    expect(cloudRunAdminTf).toContain(
      'ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"',
    );
    expect(cloudRunAdminTf).toContain("default_uri_disabled = true");
  });

  test("Cloud Run migrate Job: Cloud Build updates image only; Terraform owns shape/env", () => {
    const migrateUpdateIndex = cloudBuildConfig.indexOf("id: migrate-update");
    const migrateExecuteIndex = cloudBuildConfig.indexOf("id: migrate-execute");
    expect(migrateUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(migrateExecuteIndex).toBeGreaterThan(migrateUpdateIndex);

    const migrateUpdateStep = cloudBuildConfig.slice(
      migrateUpdateIndex,
      migrateExecuteIndex,
    );

    // Phase 6b clean-break: Step 4 is image-tag only (`:migrate-${SHORT_SHA}`).
    expect(migrateUpdateStep).toContain(":migrate-${SHORT_SHA}");
    expect(migrateUpdateStep).not.toContain("--set-secrets=");
    expect(migrateUpdateStep).not.toContain("--set-env-vars=");
    expect(migrateUpdateStep).not.toContain("--service-account=");
    expect(migrateUpdateStep).not.toContain("--command=");
    expect(migrateUpdateStep).not.toContain("--args=");
    expect(migrateUpdateStep).not.toContain("--memory=");
    expect(migrateUpdateStep).not.toContain("--cpu=");
    expect(migrateUpdateStep).not.toContain("--tasks=");
    expect(migrateUpdateStep).not.toContain("--parallelism=");
    expect(migrateUpdateStep).not.toContain("--max-retries=");
    expect(migrateUpdateStep).not.toContain("--task-timeout=");

    const cloudRunMigrateJobTf = readFileSync(
      join(process.cwd(), "terraform", "cloud_run_migrate_job.tf"),
      "utf8",
    );
    // migrate job は **`DIRECT_URL` だけ**を注入する。`prisma/schema.prisma` の
    // datasource は `url` を持たず、`prisma.config.ts` が `DIRECT_URL` →
    // `DATABASE_URL` の順で解決するので、direct が入っていれば `DATABASE_URL` は
    // 一度も読まれない。
    //
    // 以前は `DATABASE_URL` にも direct を入れていたが、そのために **1 つの
    // secret へ direct と pooled という別物を詰め、version 番号だけで区別する**
    // 形になっていた。意味を番号に持たせると、DB を切り替えるたびに pin の
    // 張り替えが要り、**忘れると migrate が旧 DB を見て exit 0 で黙って終わる**。
    expect(cloudRunMigrateJobTf).toMatch(
      /env[\s\S]*name\s*=\s*"DIRECT_URL"[\s\S]*secret_key_ref[\s\S]*google_secret_manager_secret\.secret\["DIRECT_URL"\]/,
    );
    // `DATABASE_URL`（pooled）は runtime 専用。migrate job へ注入し直さない。
    expect(cloudRunMigrateJobTf).not.toMatch(
      /name\s*=\s*"DATABASE_URL"\s*value_source/,
    );
    // 適用前チェック → migrate。順序と短絡の固定は
    // `deploy-packaging-contract.test.ts` が持つ（Dockerfile 側との一致も含めて）。
    expect(cloudRunMigrateJobTf).toContain('command = ["sh"]');
    expect(cloudRunMigrateJobTf).toContain(
      '"bun scripts/migration-preconditions.ts && bunx --bun prisma migrate deploy"',
    );
    expect(cloudRunMigrateJobTf).toContain("parallelism = 1");
    expect(cloudRunMigrateJobTf).toContain("task_count  = 1");
    expect(cloudRunMigrateJobTf).toContain('timeout     = "600s"');
    expect(cloudRunMigrateJobTf).toContain("max_retries = 0");
    expect(cloudRunMigrateJobTf).toContain('cpu    = "1"');
    expect(cloudRunMigrateJobTf).toContain('memory = "1Gi"');
    expect(runbook).toContain("Cloud Run migrate Job identity is dedicated");
    expect(runbook).toContain("Cloud Run migrate Job command is canonical");
    expect(runbook).toContain(
      "Cloud Run migrate Job execution config is canonical",
    );
  });

  test("restores service scaling when migrate-execute fails in breaking migration mode", () => {
    const migrateExecuteIndex = cloudBuildConfig.indexOf("id: migrate-execute");
    const deployPublicIndex = cloudBuildConfig.indexOf("id: deploy-public");

    expect(migrateExecuteIndex).toBeGreaterThanOrEqual(0);
    expect(deployPublicIndex).toBeGreaterThan(migrateExecuteIndex);

    const migrateExecuteStep = cloudBuildConfig.slice(
      migrateExecuteIndex,
      deployPublicIndex,
    );

    // Wrapped in bash so the failure branch can restore scaling before
    // propagating a non-zero exit code back to Cloud Build.
    expect(migrateExecuteStep).toContain("entrypoint: bash");
    expect(migrateExecuteStep).toContain(
      "gcloud run jobs execute ${_MIGRATE_JOB_NAME}",
    );

    // Recovery restores both services only in breaking mode.
    expect(migrateExecuteStep).toContain(
      'if [ "${_BREAKING_MIGRATION_DEPLOY}" = "true" ]; then',
    );
    expect(migrateExecuteStep).toContain("restore_scaling ${_SERVICE_NAME}");
    expect(migrateExecuteStep).toContain(
      "restore_scaling ${_ADMIN_SERVICE_NAME}",
    );
    expect(migrateExecuteStep).toContain("--scaling=auto");

    // Failure must still propagate so Cloud Build aborts the deploy.
    expect(migrateExecuteStep).toContain("exit 1");
  });

  test("quiesces Cloud Run services before breaking migrations can run", () => {
    expect(workflow).toContain('BREAKING_MIGRATION_DEPLOY="false"');
    expect(workflow).toContain("prisma/migrations/**/migration.sql");
    expect(workflow).toContain("RENAME[[:space:]]+COLUMN");
    expect(workflow).toContain("DROP[[:space:]]+COLUMN");
    expect(workflow).toContain(
      "_BREAKING_MIGRATION_DEPLOY=${BREAKING_MIGRATION_DEPLOY}",
    );

    expect(cloudBuildConfig).toContain('_BREAKING_MIGRATION_DEPLOY: "false"');
    expect(cloudBuildConfig).toContain(
      '_BREAKING_MIGRATION_DRAIN_SECONDS: "310"',
    );

    const migrateUpdateIndex = cloudBuildConfig.indexOf("id: migrate-update");
    const disablePublicIndex = cloudBuildConfig.indexOf(
      "id: disable-public-for-breaking-migration",
    );
    const disableAdminIndex = cloudBuildConfig.indexOf(
      "id: disable-admin-for-breaking-migration",
    );
    const drainIndex = cloudBuildConfig.indexOf(
      "id: wait-for-breaking-migration-drain",
    );
    const migrateExecuteIndex = cloudBuildConfig.indexOf("id: migrate-execute");
    const deployPublicIndex = cloudBuildConfig.indexOf("id: deploy-public");
    const deployAdminIndex = cloudBuildConfig.indexOf("id: deploy-admin");

    expect(migrateUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(disablePublicIndex).toBeGreaterThan(migrateUpdateIndex);
    expect(disableAdminIndex).toBeGreaterThan(migrateUpdateIndex);
    expect(drainIndex).toBeGreaterThan(disablePublicIndex);
    expect(drainIndex).toBeGreaterThan(disableAdminIndex);
    expect(migrateExecuteIndex).toBeGreaterThan(drainIndex);
    expect(deployPublicIndex).toBeGreaterThan(migrateExecuteIndex);
    expect(deployAdminIndex).toBeGreaterThan(migrateExecuteIndex);

    const disablePublicStep = cloudBuildConfig.slice(
      disablePublicIndex,
      disableAdminIndex,
    );
    const disableAdminStep = cloudBuildConfig.slice(
      disableAdminIndex,
      drainIndex,
    );
    const drainStep = cloudBuildConfig.slice(drainIndex, migrateExecuteIndex);
    const deployPublicStep = cloudBuildConfig.slice(
      deployPublicIndex,
      deployAdminIndex,
    );
    const deployAdminStep = cloudBuildConfig.slice(deployAdminIndex);

    expect(disablePublicStep).toContain("${_BREAKING_MIGRATION_DEPLOY}");
    expect(disablePublicStep).toContain("${_SERVICE_NAME}");
    expect(disablePublicStep).toContain("--scaling=0");
    expect(disableAdminStep).toContain("${_BREAKING_MIGRATION_DEPLOY}");
    expect(disableAdminStep).toContain("${_ADMIN_SERVICE_NAME}");
    expect(disableAdminStep).toContain("--scaling=0");
    expect(drainStep).toContain("${_BREAKING_MIGRATION_DRAIN_SECONDS}");
    expect(drainStep).toContain("sleep");
    expect(deployPublicStep).toContain("--scaling=auto");
    expect(deployAdminStep).toContain("--scaling=auto");

    expect(runbook).toContain("breaking migration deploy mode");
    expect(runbook).toContain("_BREAKING_MIGRATION_DEPLOY=true");
    expect(runbook).toContain("gcloud run services update SERVICE --scaling=0");
  });

  test("Cloud Run traffic は deploy 面が所有する", () => {
    const cloudRunPublicTf = readFileSync(
      join(process.cwd(), "terraform", "cloud_run_public.tf"),
      "utf8",
    );
    const cloudRunAdminTf = readFileSync(
      join(process.cwd(), "terraform", "cloud_run_admin.tf"),
      "utf8",
    );
    for (const tf of [cloudRunPublicTf, cloudRunAdminTf]) {
      expect(tf).toContain("TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST");
      expect(ignoreChangesEntries(tf)).toContain("traffic");
    }
  });

  test("deploy は promote と serving 検証を持つ", () => {
    expect(workflow).toContain("update-traffic");
    expect(workflow).toContain("--to-latest");

    const submit = workflow.indexOf("gcloud beta builds submit");
    const verify = workflow.indexOf("Verify canary revision before promoting");
    const promote = workflow.indexOf(
      "Promote to latest revision and verify serving image",
    );
    expect(submit).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(submit);
    expect(promote).toBeGreaterThan(verify);

    const verifyBlock = workflow.slice(verify, promote);
    expect(verifyBlock).toContain("--flatten='status.traffic[]'");
    expect(verifyBlock).toContain("status.traffic.tag");
    expect(verifyBlock).toContain("status.traffic.url");
    expect(verifyBlock).toContain('"$tag" = "canary"');
    expect(verifyBlock).toContain(
      "https://docs.cloud.google.com/run/docs/triggering/https-request",
    );
    expect(verifyBlock).toContain(
      "https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration#tags",
    );
    expect(verifyBlock).toContain('for path in "/" "/spaces"');
    expect(verifyBlock).toContain("<lastmod>");
    expect(verifyBlock).toContain('[ "$lastmod_count" -lt 1 ]');
    expect(verifyBlock).not.toContain("cf-cache-status");
    expect(verifyBlock).not.toContain("grep -Ei");
    expect(verifyBlock).not.toContain("grep -q");
    expect(verifyBlock).toContain("破壊的");
    expect(verifyBlock).not.toMatch(
      /if \[ "\$\{BREAKING_MIGRATION_DEPLOY\}" = /,
    );

    expect(workflow).toContain(
      'promote_and_verify "${SERVICE_NAME}" --clear-tags',
    );
    expect(workflow).toContain('promote_and_verify "${ADMIN_SERVICE_NAME}"');
  });

  test("public Cloud Build deploy is no-traffic canary; admin is not", () => {
    const deployPublicIndex = cloudBuildConfig.indexOf("id: deploy-public");
    const deployAdminIndex = cloudBuildConfig.indexOf("id: deploy-admin");
    expect(deployPublicIndex).toBeGreaterThanOrEqual(0);
    expect(deployAdminIndex).toBeGreaterThan(deployPublicIndex);

    const deployPublicStep = cloudBuildConfig.slice(
      deployPublicIndex,
      deployAdminIndex,
    );
    const deployAdminStep = cloudBuildConfig.slice(deployAdminIndex);

    expect(deployPublicStep).toContain("--no-traffic");
    expect(deployPublicStep).toContain("--tag=canary");
    expect(deployAdminStep).not.toContain("--no-traffic");
    expect(deployAdminStep).not.toContain("--tag=");
  });

  test("runs post-deploy smoke against public pages and admin IAP after deploy", () => {
    expect(workflow).toContain("post-deploy-smoke:");
    expect(workflow).toContain("needs: deploy");
    expect(workflow).toContain("PUBLIC_ORIGIN: ${{ env.PUBLIC_DOMAIN }}");
    expect(workflow).toContain("ADMIN_ORIGIN: ${{ env.ADMIN_DOMAIN }}");
    expect(workflow).toContain('"${PUBLIC_ORIGIN}/api/live"');
    expect(workflow).toContain('for path in "/" "/spaces"');
    expect(workflow).toContain("cf-cache-status");
    expect(workflow).toContain("deploy-probe=${probe_sha}");
    expect(workflow).toContain("/sitemap.xml?deploy-probe=");
    expect(workflow).toContain("<lastmod>");
    expect(workflow).toContain("lastmod_count=\"$(grep -c '<lastmod>'");
    expect(workflow).toContain('[ "$lastmod_count" -lt 1 ]');
    expect(workflow).toContain('"${ADMIN_ORIGIN}/"');
    expect(workflow).toContain('"$admin_code" != "302"');
    expect(workflow).toContain('"$admin_code" != "401"');
    expect(workflow).toContain(
      "needs: [require-green-main, terraform-apply, deploy, post-deploy-smoke]",
    );
    expect(workflow).toContain(
      "post-deploy-smoke の失敗: デプロイは済んでいる",
    );
  });

  test("deploy Step Summary から rollback runbook へ辿れる", () => {
    expect(
      existsSync(
        join(process.cwd(), "docs", "runbooks", "production-rollback.md"),
      ),
    ).toBe(true);
    expect(workflow).toContain("docs/runbooks/production-rollback.md");
    expect(workflow).toContain("## rollback 判定");

    const rollbackHeading = workflow.indexOf("## rollback 判定");
    expect(rollbackHeading).toBeGreaterThanOrEqual(0);
    const rollbackSummary = workflow.slice(
      rollbackHeading,
      workflow.indexOf("SHORT_SHA=", rollbackHeading),
    );
    expect(rollbackSummary).toContain("GITHUB_STEP_SUMMARY");
    expect(rollbackSummary).toContain(
      "BREAKING_MIGRATION_DEPLOY=${BREAKING_MIGRATION_DEPLOY}",
    );
  });

  /**
   * 出荷する commit で required check が全件緑であることを、deploy より前に確認する。
   *
   * ## なぜ
   *
   * 本 workflow は `workflow_dispatch` のみで、**main の CI 結果を一切参照して
   * いなかった**（`check-run` / `conclusion` の照会が全文に 0 件）。
   * `required_status_checks.strict` は意図的に false なので、互いに古い base で
   * 緑になった 2 PR が main を赤にする状況は正常に起こりうる。その赤い main を
   * terraform apply → Cloud Build → migrate → 新リビジョン公開まで止めるものが
   * 無かった。型エラーは Docker build が落とすが、ロジック回帰は素通りする。
   *
   * ## 何を見るか
   *
   * - `require-green-main` job が存在し、`terraform-apply` がそれを needs すること
   * - context の列挙を workflow へコピーせず `branch-protection.json` を読むこと
   *   （2 箇所に置いた瞬間ずれる）
   * - `success` 以外を全部不合格として扱うこと。`missing` や `in_progress` を
   *   緑と読む実装に書き換わったら落ちる
   * - 逃げ道（skip / force / override の dispatch input）を持たないこと
   *
   * ## 直し方
   *
   * 落ちたら main を緑に戻す。gate の側を緩めない。
   */
  test("赤い main を出荷できないよう required check を確認する", () => {
    expect(workflow).toContain("require-green-main:");
    expect(workflow).toContain("name: Require green main");
    expect(workflow).toContain("needs: require-green-main");

    // 列挙の SSoT は branch-protection.json（workflow 側にコピーしない）
    expect(workflow).toContain(".github/branch-protection.json");
    expect(workflow).toContain("required_status_checks.contexts");

    // success 以外は全部不合格（missing / in_progress を緑と読まない）
    expect(workflow).toContain('all(.result == "success")');
    expect(workflow).toContain('($result[.] // "missing")');

    // 逃げ道を作らない
    expect(workflow).not.toMatch(/inputs\.[a-z_]*(?:skip|force|override)/iu);
  });
});

describe("Main Terraform Health gate (abolished)", () => {
  test("does not ship the obsolete PR-blocking health workflow", () => {
    // 手動デプロイモデルでは merge ≠ deploy のため、前回 deploy 失敗で全 PR を
    // block する gate は廃止
    // (docs/adr/0002-abolish-main-terraform-health-gate.md)。
    expect(
      existsSync(
        join(
          process.cwd(),
          ".github",
          "workflows",
          "check-main-terraform-health.yml",
        ),
      ),
    ).toBe(false);
  });
});
