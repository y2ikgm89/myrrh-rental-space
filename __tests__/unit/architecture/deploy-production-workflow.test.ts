import { readFileSync } from "node:fs";
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
  test("runs on every push to main without path filters", () => {
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).not.toContain("paths-ignore:");
    expect(workflow).not.toContain("paths:");
  });

  test("uses GitHub WIF and submits Cloud Build directly", () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("google-github-actions/auth@");
    expect(workflow).toContain("workload_identity_provider:");
    expect(workflow).toContain("service_account:");
    expect(workflow).toContain("gcloud builds submit");
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
    expect(runbook).toContain(
      "IAP is enabled once during setup and then verified by the production audit",
    );
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

  test("replaces Cloud Run runtime env and secret bindings during deploys", () => {
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
      expect(step).toContain("--set-env-vars=");
      expect(step).toContain("--set-secrets=");
      expect(step).toContain("--ingress=all");
      expect(step).not.toContain("--remove-env-vars=");
      expect(step).not.toContain("--update-env-vars=");
      expect(step).not.toContain("--remove-secrets=");
      expect(step).not.toContain("--update-secrets=");
      expect(step).not.toContain("CRON_SECRET=CRON_SECRET");
      expect(step).not.toContain("ADMIN_LOGIN_TOKEN=ADMIN_LOGIN_TOKEN");
    }
  });

  test("reapplies the Cloud Run migrate Job service account during deploys", () => {
    const migrateUpdateIndex = cloudBuildConfig.indexOf("id: migrate-update");
    const migrateExecuteIndex = cloudBuildConfig.indexOf("id: migrate-execute");
    expect(migrateUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(migrateExecuteIndex).toBeGreaterThan(migrateUpdateIndex);

    const migrateUpdateStep = cloudBuildConfig.slice(
      migrateUpdateIndex,
      migrateExecuteIndex,
    );

    expect(migrateUpdateStep).toContain(
      "--service-account=${_SERVICE_ACCOUNT}",
    );
    expect(migrateUpdateStep).toContain("--set-secrets=DATABASE_URL=");
    expect(migrateUpdateStep).toContain("--command=bunx");
    expect(migrateUpdateStep).toContain("--args=--bun,prisma,migrate,deploy");
    expect(migrateUpdateStep).toContain("--tasks=1");
    expect(migrateUpdateStep).toContain("--parallelism=1");
    expect(migrateUpdateStep).toContain("--max-retries=0");
    expect(migrateUpdateStep).toContain("--task-timeout=600s");
    expect(migrateUpdateStep).toContain("--cpu=1");
    expect(runbook).toContain("Cloud Run migrate Job identity is dedicated");
    expect(runbook).toContain("Cloud Run migrate Job command is canonical");
    expect(runbook).toContain(
      "Cloud Run migrate Job execution config is canonical",
    );
  });
});
