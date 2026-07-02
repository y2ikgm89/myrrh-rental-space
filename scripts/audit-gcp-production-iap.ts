import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import {
  formatBuildServiceAccountActAsRemovalCommands,
  formatCloudBuildConnectionDeletionCommands,
  formatCloudBuildTriggerDeletionCommands,
  formatCloudRunRevisionDeletionCommands,
  formatIamPolicyBindingRemovalCommands,
  formatNamedResourcesByLocation,
  formatRuntimeGroupOwnerRepairCommands,
  formatSecretManagerSecretAccessorRemovalCommands,
  getCloudBuildConnectionAuditLocations,
  getCloudBuildTriggerAuditLocations,
  getIapCloudRunServiceIamPolicyUrl,
  getProductionHttpAuditTargets,
  readAmbiguousAdminRolePrincipalErrors,
  getExpectedSecretManagerSecretAccessorMembers,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
  REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
  readBroadProjectIamDeployGrantErrors,
  readBuildServiceAccountProjectIamRoleErrors,
  readCloudRunContainerCommandErrors,
  readCloudRunIngressErrors,
  readCloudRunJobExecutionConfigErrors,
  readCloudRunRevisionHealthErrors,
  readCloudRunRuntimeEnvErrors,
  readCloudRunServiceIdentityErrors,
  readCloudSchedulerOidcJobErrors,
  readIamPolicyMembersForRole,
  readIamRoleMembershipErrors,
  readProductionDomainConfigErrors,
  readProductionHttpTargetError,
  readProjectSecretManagerAccessorErrors,
  readSecretManagerSecretAccessorPolicyErrors,
  readSecretManagerVersionStateErrors,
  readUnexpectedSecretManagerSecretAccessorMembers,
  readUnhealthyCloudRunRevisionNames,
  readWifProviderConditionErrors,
  readCloudBuildTriggerIdentifiers,
  type ProductionHttpAuditTarget,
  type AdminRoleGroupMembership,
} from "./gcp-production-audit-model";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

type Binding = {
  role?: string;
  members?: string[];
};

type NamedResourceAuditResult = {
  location: string;
  result: GcloudJsonResult;
  names: string[];
};

type GcloudJsonResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: string;
    };

type HttpTargetResult =
  | {
      ok: true;
      status: number;
      redirectUrl: string | null;
    }
  | {
      ok: false;
      error: string;
    };

const configuredGcloudBin = process.env["GCLOUD_BIN"]?.trim();
const gcloudBin =
  configuredGcloudBin && configuredGcloudBin.length > 0
    ? configuredGcloudBin
    : process.platform === "win32"
      ? "gcloud.cmd"
      : "gcloud";
const execFileAsync = promisify(execFile);
const forbiddenCloudRunRuntimeEnvNames = [
  "ADMIN_LOGIN_TOKEN",
  "CRON_SECRET",
  "INITIAL_ADMIN_EMAIL",
  "INITIAL_ADMIN_NAME",
] as const;
const googleGroupEmailPattern = /^[^\s@:]+@[^\s@:]+\.[^\s@]+$/u;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace`);
  }
  return value;
}

function formatGcloudError(args: string[], error: unknown): string {
  if (error instanceof Error && "stderr" in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    return `${gcloudBin} ${args.join(" ")} failed${stderr ? `: ${stderr.trim()}` : ""}`;
  }
  return `${gcloudBin} ${args.join(" ")} failed: ${String(error)}`;
}

function runGcloudJson(args: string[]): unknown {
  try {
    const output = execFileSync(gcloudBin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const trimmed = output.trim();
    return trimmed ? JSON.parse(trimmed) : null;
  } catch (error) {
    throw new Error(formatGcloudError(args, error));
  }
}

function runGcloudText(args: string[]): string {
  try {
    return execFileSync(gcloudBin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(formatGcloudError(args, error));
  }
}

function assertGcloudNonInteractiveAuth(): void {
  try {
    const token = runGcloudText(["auth", "print-access-token"]).trim();
    if (!token) {
      throw new Error("gcloud auth print-access-token returned an empty token");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        "gcloud authentication is refreshable check failed.",
        "Run `gcloud auth login` in the same Windows user/profile used by Codex,",
        "then verify `gcloud auth print-access-token` succeeds before rerunning this audit.",
        `Original error: ${detail}`,
      ].join(" "),
    );
  }
}

function tryRunGcloudJson(args: string[]): GcloudJsonResult {
  try {
    return { ok: true, value: runGcloudJson(args) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : formatGcloudError(args, error),
    };
  }
}

async function runGcloudJsonAsync(args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(gcloudBin, args, {
      encoding: "utf8",
      windowsHide: true,
    });
    const trimmed = String(stdout).trim();
    return trimmed ? JSON.parse(trimmed) : null;
  } catch (error) {
    throw new Error(formatGcloudError(args, error));
  }
}

async function tryRunGcloudJsonAsync(
  args: string[],
): Promise<GcloudJsonResult> {
  try {
    return { ok: true, value: await runGcloudJsonAsync(args) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : formatGcloudError(args, error),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function readBindings(value: unknown): Binding[] {
  if (!isRecord(value)) return [];
  const bindings = value["bindings"];
  if (!Array.isArray(bindings)) return [];
  return bindings.filter(isRecord).map((binding) => {
    const role = binding["role"];
    const members = binding["members"];
    return {
      ...(typeof role === "string" && { role }),
      ...(Array.isArray(members) && {
        members: members.filter((member): member is string => {
          return typeof member === "string";
        }),
      }),
    };
  });
}

function readMembershipRoles(record: Record<string, unknown>): string[] {
  const roles = record["roles"];
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => {
      return isRecord(role) ? role["name"] : undefined;
    })
    .filter((role): role is string => typeof role === "string");
}

function membersForRole(bindings: Binding[], role: string): string[] {
  return bindings
    .filter((binding) => binding.role === role)
    .flatMap((binding) => binding.members ?? []);
}

function unexpectedMembersForRole(
  policy: unknown,
  role: string,
  expectedMembers: readonly string[],
): string[] {
  const expectedMemberSet = new Set(expectedMembers);
  return readIamPolicyMembersForRole(policy, role)
    .filter((member) => !expectedMemberSet.has(member))
    .sort();
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function detailForResult(result: GcloudJsonResult, detail: string): string {
  return result.ok ? detail : result.error;
}

function requireGoogleGroupEmail(name: string): string {
  const value = requireEnv(name);
  if (!googleGroupEmailPattern.test(value)) {
    throw new Error(
      `${name} must be a bare Google Group email like admins@example.com`,
    );
  }
  return value;
}

async function fetchHttpTarget(
  target: ProductionHttpAuditTarget,
): Promise<HttpTargetResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(target.url, {
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: true,
      status: response.status,
      redirectUrl: response.headers.get("location"),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readRedirectHost(redirectUrl: string | null): string {
  if (!redirectUrl) return "none";
  try {
    return new URL(redirectUrl).hostname;
  } catch {
    return "invalid";
  }
}

function summarizeResponseBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "empty response";
  return trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
}

async function runIapCloudRunServiceIamPolicyJson(
  projectNumber: string,
  region: string,
  service: string,
): Promise<unknown> {
  const accessToken = runGcloudText(["auth", "print-access-token"]).trim();
  if (!accessToken) {
    throw new Error("gcloud auth print-access-token returned an empty token");
  }

  const url = getIapCloudRunServiceIamPolicyUrl(projectNumber, region, service);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `IAP Cloud Run getIamPolicy REST API failed (${response.status} ${response.statusText}) for ${url}: ${summarizeResponseBody(body)}`,
    );
  }

  const trimmed = body.trim();
  return trimmed ? JSON.parse(trimmed) : null;
}

async function auditCloudBuildTriggers(
  projectId: string,
  region: string,
): Promise<NamedResourceAuditResult[]> {
  return Promise.all(
    getCloudBuildTriggerAuditLocations(region).map(async (location) => {
      const result = await tryRunGcloudJsonAsync([
        "builds",
        "triggers",
        "list",
        "--project",
        projectId,
        "--region",
        location,
        "--format=json(id,name)",
      ]);
      return {
        location,
        result,
        names: result.ok ? readCloudBuildTriggerIdentifiers(result.value) : [],
      };
    }),
  );
}

async function auditCloudBuildConnections(
  projectId: string,
  region: string,
): Promise<NamedResourceAuditResult[]> {
  return Promise.all(
    getCloudBuildConnectionAuditLocations(region).map(async (location) => {
      const result = await tryRunGcloudJsonAsync([
        "builds",
        "connections",
        "list",
        "--project",
        projectId,
        "--region",
        location,
        "--format=json(name)",
      ]);
      return {
        location,
        result,
        names: result.ok
          ? readRecords(result.value)
              .map((record) => record["name"])
              .filter((name): name is string => typeof name === "string")
          : [],
      };
    }),
  );
}

async function main(): Promise<void> {
  assertGcloudNonInteractiveAuth();

  const projectId = requireEnv("GCP_PROJECT_ID");
  const region = requireEnv("REGION");
  const publicService = requireEnv("SERVICE_NAME");
  const adminService = requireEnv("ADMIN_SERVICE_NAME");
  const migrateJobName = requireEnv("MIGRATE_JOB_NAME");
  const artifactRepository = requireEnv("AR_REPOSITORY");
  const expectedRoleGroupEmails = [
    requireGoogleGroupEmail("ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"),
    requireGoogleGroupEmail("ADMIN_ROLE_GROUP_ADMIN_EMAIL"),
    requireGoogleGroupEmail("ADMIN_ROLE_GROUP_EDITOR_EMAIL"),
    requireGoogleGroupEmail("ADMIN_ROLE_GROUP_VIEWER_EMAIL"),
  ];
  const expectedIapMembers = expectedRoleGroupEmails.map(
    (email) => `group:${email}`,
  );
  const expectedOrganizationId = requireEnv("GCP_ORGANIZATION_ID");
  const cloudIdentityDomain = requireEnv("CLOUD_IDENTITY_DOMAIN");
  const buildServiceAccount = requireEnv("BUILD_SERVICE_ACCOUNT");
  const runtimeServiceAccount = requireEnv("RUNTIME_SERVICE_ACCOUNT");
  const githubRepositoryId = requireEnv("GITHUB_REPOSITORY_ID");
  const githubRepositoryOwnerId = requireEnv("GITHUB_REPOSITORY_OWNER_ID");
  const githubRepository = requireEnv("GITHUB_REPOSITORY");
  const wifPoolId = requireEnv("WIF_POOL_ID");
  const wifProviderId = requireEnv("WIF_PROVIDER_ID");
  const publicDomain = requireEnv("PUBLIC_DOMAIN");
  const adminDomain = requireEnv("ADMIN_DOMAIN");
  const schedulerServiceAccount = requireEnv("CRON_SERVICE_ACCOUNT_EMAIL");

  const checks: Check[] = [];
  const addCheck = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  const project = runGcloudJson([
    "projects",
    "describe",
    projectId,
    "--format=json(projectNumber)",
  ]);
  const projectNumber = getPath(project, ["projectNumber"]);
  if (typeof projectNumber !== "string") {
    throw new Error("Unable to read projectNumber");
  }
  const expectedIapJwtAudience = `/projects/${projectNumber}/locations/${region}/services/${adminService}`;

  const ancestors = runGcloudJson([
    "projects",
    "get-ancestors",
    projectId,
    "--format=json",
  ]);
  const ancestorRows = Array.isArray(ancestors) ? ancestors : [];
  const organization = ancestorRows.find((item) => {
    return isRecord(item) && item["type"] === "organization";
  });
  const organizationId = isRecord(organization)
    ? organization["id"]
    : undefined;
  addCheck(
    "project is under the configured Google Cloud Organization",
    organizationId === expectedOrganizationId,
    `actual=${String(organizationId ?? "none")} expected=${expectedOrganizationId}`,
  );

  const cloudIdentityApi = tryRunGcloudJson([
    "services",
    "list",
    "--project",
    projectId,
    "--enabled",
    "--filter=config.name:cloudidentity.googleapis.com",
    "--format=json(config.name,name)",
  ]);
  const enabledCloudIdentityServices = cloudIdentityApi.ok
    ? readRecords(cloudIdentityApi.value)
        .map((record) => {
          const configName = getPath(record, ["config", "name"]);
          const name = record["name"];
          if (typeof configName === "string") return configName;
          if (typeof name === "string") return name;
          return null;
        })
        .filter((name): name is string => name !== null)
    : [];
  addCheck(
    "Cloud Identity API is enabled",
    cloudIdentityApi.ok &&
      enabledCloudIdentityServices.some((serviceName) => {
        return serviceName === "cloudidentity.googleapis.com";
      }),
    detailForResult(
      cloudIdentityApi,
      `services=${enabledCloudIdentityServices.join(",") || "none"}`,
    ),
  );

  addCheck(
    "admin role groups are Google Group emails",
    expectedRoleGroupEmails.length === 4 &&
      expectedRoleGroupEmails.every((email) => email.includes("@")),
    `groups=${expectedRoleGroupEmails.join(",")}`,
  );

  const roleGroupMemberships: AdminRoleGroupMembership[] = [];

  for (const expectedGroupEmail of expectedRoleGroupEmails) {
    const groupDescription = tryRunGcloudJson([
      "identity",
      "groups",
      "describe",
      expectedGroupEmail,
      "--format=json(name,groupKey.id,labels)",
    ]);
    const groupName = groupDescription.ok
      ? getPath(groupDescription.value, ["name"])
      : undefined;
    const groupKeyId = groupDescription.ok
      ? getPath(groupDescription.value, ["groupKey", "id"])
      : undefined;
    addCheck(
      `role Google Group exists: ${expectedGroupEmail}`,
      groupDescription.ok &&
        typeof groupName === "string" &&
        groupKeyId === expectedGroupEmail,
      detailForResult(
        groupDescription,
        `group=${String(groupKeyId ?? "missing")} name=${String(groupName ?? "missing")} domain=${cloudIdentityDomain}`,
      ),
    );

    const groupMemberships = tryRunGcloudJson([
      "identity",
      "groups",
      "memberships",
      "list",
      "--group-email",
      expectedGroupEmail,
      "--view=full",
      "--format=json(preferredMemberKey.id,type,roles)",
    ]);
    const membershipRows = groupMemberships.ok
      ? readRecords(groupMemberships.value)
      : [];
    for (const record of membershipRows) {
      const memberEmail = getPath(record, ["preferredMemberKey", "id"]);
      const memberType = record["type"];
      if (typeof memberEmail !== "string") continue;
      roleGroupMemberships.push({
        groupEmail: expectedGroupEmail,
        memberEmail,
        ...(typeof memberType === "string" && { memberType }),
      });
    }
    const runtimeMembership = membershipRows.find((record) => {
      return (
        getPath(record, ["preferredMemberKey", "id"]) === runtimeServiceAccount
      );
    });
    const runtimeMembershipRoles = runtimeMembership
      ? readMembershipRoles(runtimeMembership)
      : [];
    const runtimeGroupOwnerRepairCommands =
      groupMemberships.ok && !runtimeMembershipRoles.includes("OWNER")
        ? formatRuntimeGroupOwnerRepairCommands(
            expectedGroupEmail,
            runtimeServiceAccount,
          )
        : [];
    addCheck(
      `runtime service account owns role Google Group: ${expectedGroupEmail}`,
      groupMemberships.ok && runtimeMembershipRoles.includes("OWNER"),
      detailForResult(
        groupMemberships,
        [
          `runtime=${runtimeServiceAccount}`,
          `roles=${runtimeMembershipRoles.join(",") || "none"}`,
          `repairCommands=${runtimeGroupOwnerRepairCommands.join(" | ") || "none"}`,
        ].join(" "),
      ),
    );
  }

  const ambiguousAdminRolePrincipals =
    readAmbiguousAdminRolePrincipalErrors(roleGroupMemberships);
  addCheck(
    "non-service-account principals are assigned to at most one admin role Google Group",
    ambiguousAdminRolePrincipals.length === 0,
    `ambiguous=${ambiguousAdminRolePrincipals.join(";") || "none"}`,
  );

  const publicServiceDescription = runGcloudJson([
    "run",
    "services",
    "describe",
    publicService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const adminServiceDescription = runGcloudJson([
    "run",
    "services",
    "describe",
    adminService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const publicServiceIdentityErrors = readCloudRunServiceIdentityErrors(
    publicServiceDescription,
    {
      resourceName: publicService,
      expectedServiceAccount: runtimeServiceAccount,
    },
  );
  const adminServiceIdentityErrors = readCloudRunServiceIdentityErrors(
    adminServiceDescription,
    {
      resourceName: adminService,
      expectedServiceAccount: runtimeServiceAccount,
    },
  );
  const serviceIdentityErrors = [
    ...publicServiceIdentityErrors,
    ...adminServiceIdentityErrors,
  ];
  addCheck(
    "Cloud Run service identities are dedicated",
    serviceIdentityErrors.length === 0,
    `errors=${serviceIdentityErrors.join(",") || "none"}`,
  );
  const serviceIngressErrors = [
    ...readCloudRunIngressErrors(publicServiceDescription, {
      serviceName: publicService,
      expectedIngress: "all",
    }),
    ...readCloudRunIngressErrors(adminServiceDescription, {
      serviceName: adminService,
      expectedIngress: "all",
    }),
  ];
  addCheck(
    "Cloud Run service ingress is canonical",
    serviceIngressErrors.length === 0,
    `errors=${serviceIngressErrors.join(",") || "none"}`,
  );
  const publicRuntimeEnvErrors = readCloudRunRuntimeEnvErrors(
    publicServiceDescription,
    {
      serviceName: publicService,
      expectedEnv: {
        APP_SURFACE: "public",
        ADMIN_APP_URL: adminDomain,
        BETTER_AUTH_URL: publicDomain,
        NEXT_PUBLIC_BASE_URL: publicDomain,
        NEXT_PUBLIC_APP_URL: publicDomain,
        CRON_OIDC_AUDIENCE: publicDomain,
        CRON_SERVICE_ACCOUNT_EMAIL: schedulerServiceAccount,
      },
      requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
      forbiddenEnvNames: forbiddenCloudRunRuntimeEnvNames,
    },
  );
  addCheck(
    "public Cloud Run runtime env is canonical",
    publicRuntimeEnvErrors.length === 0,
    `errors=${publicRuntimeEnvErrors.join(",") || "none"}`,
  );
  const adminRuntimeEnvErrors = readCloudRunRuntimeEnvErrors(
    adminServiceDescription,
    {
      serviceName: adminService,
      expectedEnv: {
        APP_SURFACE: "admin",
        ADMIN_APP_URL: adminDomain,
        BETTER_AUTH_URL: adminDomain,
        NEXT_PUBLIC_BASE_URL: publicDomain,
        NEXT_PUBLIC_APP_URL: adminDomain,
        IAP_JWT_AUDIENCE: expectedIapJwtAudience,
        CRON_OIDC_AUDIENCE: publicDomain,
        CRON_SERVICE_ACCOUNT_EMAIL: schedulerServiceAccount,
      },
      requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
      forbiddenEnvNames: forbiddenCloudRunRuntimeEnvNames,
    },
  );
  addCheck(
    "admin Cloud Run runtime env is canonical",
    adminRuntimeEnvErrors.length === 0,
    `errors=${adminRuntimeEnvErrors.join(",") || "none"}`,
  );

  const migrateJobDescription = runGcloudJson([
    "run",
    "jobs",
    "describe",
    migrateJobName,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const migrateJobIdentityErrors = readCloudRunServiceIdentityErrors(
    migrateJobDescription,
    {
      resourceName: migrateJobName,
      expectedServiceAccount: runtimeServiceAccount,
    },
  );
  addCheck(
    "Cloud Run migrate Job identity is dedicated",
    migrateJobIdentityErrors.length === 0,
    `errors=${migrateJobIdentityErrors.join(",") || "none"}`,
  );
  const migrateJobRuntimeEnvErrors = readCloudRunRuntimeEnvErrors(
    migrateJobDescription,
    {
      serviceName: migrateJobName,
      expectedEnv: {},
      requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
      forbiddenEnvNames: forbiddenCloudRunRuntimeEnvNames,
    },
  );
  addCheck(
    "Cloud Run migrate Job env is canonical",
    migrateJobRuntimeEnvErrors.length === 0,
    `errors=${migrateJobRuntimeEnvErrors.join(",") || "none"}`,
  );
  const migrateJobCommandErrors = readCloudRunContainerCommandErrors(
    migrateJobDescription,
    {
      resourceName: migrateJobName,
      expectedCommand: REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
      expectedArgs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
    },
  );
  addCheck(
    "Cloud Run migrate Job command is canonical",
    migrateJobCommandErrors.length === 0,
    `errors=${migrateJobCommandErrors.join(",") || "none"}`,
  );
  const migrateJobExecutionConfigErrors = readCloudRunJobExecutionConfigErrors(
    migrateJobDescription,
    {
      resourceName: migrateJobName,
    },
  );
  addCheck(
    "Cloud Run migrate Job execution config is canonical",
    migrateJobExecutionConfigErrors.length === 0,
    `errors=${migrateJobExecutionConfigErrors.join(",") || "none"}`,
  );

  const secretVersionResults = await Promise.all(
    REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.map(async (ref) => {
      const result = await tryRunGcloudJsonAsync([
        "secrets",
        "versions",
        "describe",
        ref.version,
        "--secret",
        ref.name,
        "--project",
        projectId,
        "--format=json(name,state)",
      ]);
      const errors = result.ok
        ? readSecretManagerVersionStateErrors(result.value, ref)
        : [
            `${ref.name} Secret Manager version ${ref.version} metadata describe failed`,
          ];
      return { ref, result, errors };
    }),
  );
  const secretVersionErrors = secretVersionResults.flatMap((entry) => {
    return entry.result.ok
      ? entry.errors
      : [...entry.errors, entry.result.error];
  });
  addCheck(
    "required Secret Manager versions are enabled",
    secretVersionErrors.length === 0,
    `errors=${secretVersionErrors.join(",") || "none"}`,
  );

  const secretAccessorPolicyResults = await Promise.all(
    REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.map(async (ref) => {
      const result = await tryRunGcloudJsonAsync([
        "secrets",
        "get-iam-policy",
        ref.name,
        "--project",
        projectId,
        "--format=json",
      ]);
      const expectedMembers = getExpectedSecretManagerSecretAccessorMembers({
        secretName: ref.name,
        runtimeServiceAccount,
        buildServiceAccount,
      });
      const errors = result.ok
        ? readSecretManagerSecretAccessorPolicyErrors(result.value, {
            secretName: ref.name,
            expectedMembers,
          })
        : [`${ref.name} Secret Manager IAM policy describe failed`];
      const unexpectedMembers = result.ok
        ? readUnexpectedSecretManagerSecretAccessorMembers(
            result.value,
            expectedMembers,
          )
        : [];
      const removalCommands = formatSecretManagerSecretAccessorRemovalCommands(
        projectId,
        ref.name,
        unexpectedMembers,
      );
      return { ref, result, errors, removalCommands };
    }),
  );
  const secretAccessorPolicyErrors = secretAccessorPolicyResults.flatMap(
    (entry) => {
      return entry.result.ok
        ? entry.errors
        : [...entry.errors, entry.result.error];
    },
  );
  const secretAccessorPolicyRemovalCommands =
    secretAccessorPolicyResults.flatMap((entry) => entry.removalCommands);
  addCheck(
    "required Secret Manager accessor IAM is least privilege",
    secretAccessorPolicyErrors.length === 0,
    [
      `errors=${secretAccessorPolicyErrors.join(",") || "none"}`,
      `removeCommands=${secretAccessorPolicyRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const publicRevisions = tryRunGcloudJson([
    "run",
    "revisions",
    "list",
    "--service",
    publicService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json(metadata.name,status.conditions)",
  ]);
  const publicRevisionHealthErrors = publicRevisions.ok
    ? readCloudRunRevisionHealthErrors(publicRevisions.value, publicService)
    : [];
  const publicUnhealthyRevisions = publicRevisions.ok
    ? readUnhealthyCloudRunRevisionNames(publicRevisions.value)
    : [];
  const publicRevisionDeletionCommands = formatCloudRunRevisionDeletionCommands(
    projectId,
    region,
    publicUnhealthyRevisions,
  );
  addCheck(
    "public Cloud Run revisions are healthy",
    publicRevisions.ok && publicRevisionHealthErrors.length === 0,
    detailForResult(
      publicRevisions,
      [
        `errors=${publicRevisionHealthErrors.join(",") || "none"}`,
        `deleteCommands=${publicRevisionDeletionCommands.join(" | ") || "none"}`,
      ].join(" "),
    ),
  );

  const adminRevisions = tryRunGcloudJson([
    "run",
    "revisions",
    "list",
    "--service",
    adminService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json(metadata.name,status.conditions)",
  ]);
  const adminRevisionHealthErrors = adminRevisions.ok
    ? readCloudRunRevisionHealthErrors(adminRevisions.value, adminService)
    : [];
  const adminUnhealthyRevisions = adminRevisions.ok
    ? readUnhealthyCloudRunRevisionNames(adminRevisions.value)
    : [];
  const adminRevisionDeletionCommands = formatCloudRunRevisionDeletionCommands(
    projectId,
    region,
    adminUnhealthyRevisions,
  );
  addCheck(
    "admin Cloud Run revisions are healthy",
    adminRevisions.ok && adminRevisionHealthErrors.length === 0,
    detailForResult(
      adminRevisions,
      [
        `errors=${adminRevisionHealthErrors.join(",") || "none"}`,
        `deleteCommands=${adminRevisionDeletionCommands.join(" | ") || "none"}`,
      ].join(" "),
    ),
  );

  const adminIapEnabled = getPath(adminServiceDescription, [
    "metadata",
    "annotations",
    "run.googleapis.com/iap-enabled",
  ]);
  const adminUrl = getPath(adminServiceDescription, ["status", "url"]);
  addCheck(
    "admin Cloud Run service has direct IAP enabled",
    adminIapEnabled === "true",
    `iap-enabled=${String(adminIapEnabled ?? "missing")} url=${String(adminUrl ?? "missing")}`,
  );

  const adminRunIamPolicy = runGcloudJson([
    "run",
    "services",
    "get-iam-policy",
    adminService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const adminRunIam = readBindings(adminRunIamPolicy);
  const adminRunInvokers = membersForRole(adminRunIam, "roles/run.invoker");
  const expectedIapInvoker = `serviceAccount:service-${projectNumber}@gcp-sa-iap.iam.gserviceaccount.com`;
  addCheck(
    "admin Cloud Run invoker is the IAP service agent",
    adminRunInvokers.includes(expectedIapInvoker),
    `invokers=${adminRunInvokers.join(",") || "none"}`,
  );
  addCheck(
    "admin Cloud Run is not public",
    !adminRunInvokers.some((member) => {
      return member === "allUsers" || member === "allAuthenticatedUsers";
    }),
    `invokers=${adminRunInvokers.join(",") || "none"}`,
  );

  const iapIam = readBindings(
    await runIapCloudRunServiceIamPolicyJson(
      projectNumber,
      region,
      adminService,
    ),
  );
  const iapAccessors = membersForRole(
    iapIam,
    "roles/iap.httpsResourceAccessor",
  );
  const missingIapMembers = expectedIapMembers.filter(
    (member) => !iapAccessors.includes(member),
  );
  const unexpectedIapMembers = iapAccessors.filter(
    (member) => !expectedIapMembers.includes(member),
  );
  addCheck(
    "IAP access is granted to every admin role Google Group",
    missingIapMembers.length === 0,
    `accessors=${iapAccessors.join(",") || "none"} missing=${missingIapMembers.join(",") || "none"}`,
  );
  addCheck(
    "IAP access is limited to admin role Google Groups",
    iapAccessors.length > 0 &&
      iapAccessors.every((member) => member.startsWith("group:")) &&
      unexpectedIapMembers.length === 0,
    `accessors=${iapAccessors.join(",") || "none"} unexpected=${unexpectedIapMembers.join(",") || "none"}`,
  );

  const publicRunIamPolicy = runGcloudJson([
    "run",
    "services",
    "get-iam-policy",
    publicService,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const publicRunIam = readBindings(publicRunIamPolicy);
  const publicRunInvokers = membersForRole(publicRunIam, "roles/run.invoker");
  addCheck(
    "public Cloud Run service is publicly invokable",
    publicRunInvokers.includes("allUsers"),
    `invokers=${publicRunInvokers.join(",") || "none"}`,
  );

  const productionDomainConfig = { publicDomain, adminDomain };
  const productionDomainErrors = readProductionDomainConfigErrors(
    productionDomainConfig,
  );
  addCheck(
    "production HTTP domains are canonical HTTPS URLs",
    productionDomainErrors.length === 0,
    productionDomainErrors.length > 0
      ? `errors=${productionDomainErrors.join(",")}`
      : `publicDomain=${publicDomain} adminDomain=${adminDomain}`,
  );

  if (productionDomainErrors.length === 0) {
    for (const target of getProductionHttpAuditTargets(
      productionDomainConfig,
    )) {
      const result = await fetchHttpTarget(target);
      const error = result.ok
        ? readProductionHttpTargetError(target, result)
        : result.error;
      const detail = result.ok
        ? `url=${target.url} status=${result.status} redirectHost=${readRedirectHost(result.redirectUrl)}`
        : `url=${target.url} error=${result.error}`;
      addCheck(
        target.name,
        result.ok && error === null,
        error === null ? detail : `${detail} error=${error}`,
      );
    }
  }

  const wifProvider = tryRunGcloudJson([
    "iam",
    "workload-identity-pools",
    "providers",
    "describe",
    wifProviderId,
    "--project",
    projectId,
    "--location=global",
    "--workload-identity-pool",
    wifPoolId,
    "--format=json(name,state,attributeCondition)",
  ]);
  const wifProviderState = wifProvider.ok
    ? getPath(wifProvider.value, ["state"])
    : undefined;
  const wifProviderCondition = wifProvider.ok
    ? getPath(wifProvider.value, ["attributeCondition"])
    : undefined;
  const wifProviderConditionErrors = readWifProviderConditionErrors(
    wifProviderCondition,
    {
      repository: githubRepository,
      repositoryId: githubRepositoryId,
      repositoryOwnerId: githubRepositoryOwnerId,
    },
  );
  addCheck(
    "GitHub Actions WIF provider is active",
    wifProvider.ok && wifProviderState === "ACTIVE",
    detailForResult(
      wifProvider,
      `provider=${wifProviderId} pool=${wifPoolId} state=${String(wifProviderState ?? "missing")}`,
    ),
  );
  addCheck(
    "GitHub Actions WIF provider is restricted to the configured repository",
    wifProvider.ok && wifProviderConditionErrors.length === 0,
    detailForResult(
      wifProvider,
      wifProviderConditionErrors.length === 0
        ? `condition=${String(wifProviderCondition ?? "missing")}`
        : `errors=${wifProviderConditionErrors.join(",")} condition=${String(wifProviderCondition ?? "missing")}`,
    ),
  );

  const buildServiceAccountIamPolicy = runGcloudJson([
    "iam",
    "service-accounts",
    "get-iam-policy",
    buildServiceAccount,
    "--project",
    projectId,
    "--format=json",
  ]);
  const buildServiceAccountIam = readBindings(buildServiceAccountIamPolicy);
  const projectIam = runGcloudJson([
    "projects",
    "get-iam-policy",
    projectId,
    "--format=json",
  ]);
  const broadProjectIamDeployGrantErrors =
    readBroadProjectIamDeployGrantErrors(projectIam);
  addCheck(
    "project IAM has no broad deploy impersonation grants",
    broadProjectIamDeployGrantErrors.length === 0,
    `grants=${broadProjectIamDeployGrantErrors.join(",") || "none"}`,
  );
  const projectSecretManagerAccessorErrors =
    readProjectSecretManagerAccessorErrors(projectIam);
  addCheck(
    "project IAM has no broad Secret Manager accessor grants",
    projectSecretManagerAccessorErrors.length === 0,
    `errors=${projectSecretManagerAccessorErrors.join(",") || "none"}`,
  );
  const buildServiceAccountProjectIamRoleErrors =
    readBuildServiceAccountProjectIamRoleErrors(
      projectIam,
      buildServiceAccount,
    );
  addCheck(
    "build service account project-level roles are limited to Cloud Build execution",
    buildServiceAccountProjectIamRoleErrors.length === 0,
    `errors=${buildServiceAccountProjectIamRoleErrors.join(",") || "none"}`,
  );
  const expectedBuildServiceAccountUser = `serviceAccount:${buildServiceAccount}`;
  const expectedBuildServiceAccountUsers = [expectedBuildServiceAccountUser];
  const artifactRepositoryIamPolicy = runGcloudJson([
    "artifacts",
    "repositories",
    "get-iam-policy",
    artifactRepository,
    "--project",
    projectId,
    "--location",
    region,
    "--format=json",
  ]);
  const artifactRepositoryWriterRole = "roles/artifactregistry.writer";
  const artifactRepositoryWriterErrors = readIamRoleMembershipErrors(
    artifactRepositoryIamPolicy,
    {
      resourceName: `Artifact Registry repository ${artifactRepository}`,
      role: artifactRepositoryWriterRole,
      expectedMembers: expectedBuildServiceAccountUsers,
    },
  );
  const artifactRepositoryWriterRemovalCommands =
    formatIamPolicyBindingRemovalCommands({
      baseCommand: `gcloud artifacts repositories remove-iam-policy-binding "${artifactRepository}"`,
      role: artifactRepositoryWriterRole,
      members: unexpectedMembersForRole(
        artifactRepositoryIamPolicy,
        artifactRepositoryWriterRole,
        expectedBuildServiceAccountUsers,
      ),
      additionalArgs: [
        `  --project="${projectId}"`,
        `  --location="${region}"`,
      ],
    });
  addCheck(
    "Artifact Registry repository writer is limited to build service account",
    artifactRepositoryWriterErrors.length === 0,
    [
      `errors=${artifactRepositoryWriterErrors.join(",") || "none"}`,
      `removeCommands=${artifactRepositoryWriterRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const migrateJobIamPolicy = runGcloudJson([
    "run",
    "jobs",
    "get-iam-policy",
    migrateJobName,
    "--project",
    projectId,
    "--region",
    region,
    "--format=json",
  ]);
  const cloudRunDeployAdminRole = "roles/run.admin";
  const cloudRunDeployAdminPolicies = [
    {
      policy: publicRunIamPolicy,
      resourceName: `Cloud Run service ${publicService}`,
      baseCommand: `gcloud run services remove-iam-policy-binding "${publicService}"`,
      additionalArgs: [`  --project="${projectId}"`, `  --region="${region}"`],
    },
    {
      policy: adminRunIamPolicy,
      resourceName: `Cloud Run service ${adminService}`,
      baseCommand: `gcloud run services remove-iam-policy-binding "${adminService}"`,
      additionalArgs: [`  --project="${projectId}"`, `  --region="${region}"`],
    },
    {
      policy: migrateJobIamPolicy,
      resourceName: `Cloud Run Job ${migrateJobName}`,
      baseCommand: `gcloud run jobs remove-iam-policy-binding "${migrateJobName}"`,
      additionalArgs: [`  --project="${projectId}"`, `  --region="${region}"`],
    },
  ] as const;
  const cloudRunDeployAdminErrors = cloudRunDeployAdminPolicies.flatMap(
    (entry) => {
      return readIamRoleMembershipErrors(entry.policy, {
        resourceName: entry.resourceName,
        role: cloudRunDeployAdminRole,
        expectedMembers: expectedBuildServiceAccountUsers,
      });
    },
  );
  const cloudRunDeployAdminRemovalCommands =
    cloudRunDeployAdminPolicies.flatMap((entry) => {
      return formatIamPolicyBindingRemovalCommands({
        baseCommand: entry.baseCommand,
        role: cloudRunDeployAdminRole,
        members: unexpectedMembersForRole(
          entry.policy,
          cloudRunDeployAdminRole,
          expectedBuildServiceAccountUsers,
        ),
        additionalArgs: entry.additionalArgs,
      });
    });
  addCheck(
    "Cloud Run deploy admin grants are limited to build service account",
    cloudRunDeployAdminErrors.length === 0,
    [
      `errors=${cloudRunDeployAdminErrors.join(",") || "none"}`,
      `removeCommands=${cloudRunDeployAdminRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const runtimeServiceAccountIamPolicy = runGcloudJson([
    "iam",
    "service-accounts",
    "get-iam-policy",
    runtimeServiceAccount,
    "--project",
    projectId,
    "--format=json",
  ]);
  const serviceAccountUserRole = "roles/iam.serviceAccountUser";
  const serviceAccountTokenCreatorRole = "roles/iam.serviceAccountTokenCreator";
  const runtimeServiceAccountActAsErrors = readIamRoleMembershipErrors(
    runtimeServiceAccountIamPolicy,
    {
      resourceName: `runtime service account ${runtimeServiceAccount}`,
      role: serviceAccountUserRole,
      expectedMembers: expectedBuildServiceAccountUsers,
    },
  );
  const runtimeServiceAccountActAsRemovalCommands =
    formatIamPolicyBindingRemovalCommands({
      baseCommand: `gcloud iam service-accounts remove-iam-policy-binding "${runtimeServiceAccount}"`,
      role: serviceAccountUserRole,
      members: unexpectedMembersForRole(
        runtimeServiceAccountIamPolicy,
        serviceAccountUserRole,
        expectedBuildServiceAccountUsers,
      ),
      additionalArgs: [`  --project="${projectId}"`],
    });
  addCheck(
    "runtime service account actAs grant is limited to build service account",
    runtimeServiceAccountActAsErrors.length === 0,
    [
      `errors=${runtimeServiceAccountActAsErrors.join(",") || "none"}`,
      `removeCommands=${runtimeServiceAccountActAsRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const runtimeServiceAccountTokenCreatorErrors = readIamRoleMembershipErrors(
    runtimeServiceAccountIamPolicy,
    {
      resourceName: `runtime service account ${runtimeServiceAccount}`,
      role: serviceAccountTokenCreatorRole,
      expectedMembers: [],
    },
  );
  const runtimeServiceAccountTokenCreatorRemovalCommands =
    formatIamPolicyBindingRemovalCommands({
      baseCommand: `gcloud iam service-accounts remove-iam-policy-binding "${runtimeServiceAccount}"`,
      role: serviceAccountTokenCreatorRole,
      members: unexpectedMembersForRole(
        runtimeServiceAccountIamPolicy,
        serviceAccountTokenCreatorRole,
        [],
      ),
      additionalArgs: [`  --project="${projectId}"`],
    });
  addCheck(
    "runtime service account tokenCreator grants are absent",
    runtimeServiceAccountTokenCreatorErrors.length === 0,
    [
      `errors=${runtimeServiceAccountTokenCreatorErrors.join(",") || "none"}`,
      `removeCommands=${runtimeServiceAccountTokenCreatorRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const cloudBuildSourceBucket = `${projectId}_cloudbuild`;
  const cloudBuildSourceBucketIamPolicy = runGcloudJson([
    "storage",
    "buckets",
    "get-iam-policy",
    `gs://${cloudBuildSourceBucket}`,
    "--format=json",
  ]);
  const cloudBuildSourceBucketRole = "roles/storage.objectViewer";
  const cloudBuildSourceBucketErrors = readIamRoleMembershipErrors(
    cloudBuildSourceBucketIamPolicy,
    {
      resourceName: `Cloud Build source bucket gs://${cloudBuildSourceBucket}`,
      role: cloudBuildSourceBucketRole,
      expectedMembers: expectedBuildServiceAccountUsers,
    },
  );
  const cloudBuildSourceBucketRemovalCommands =
    formatIamPolicyBindingRemovalCommands({
      baseCommand: `gcloud storage buckets remove-iam-policy-binding "gs://${cloudBuildSourceBucket}"`,
      role: cloudBuildSourceBucketRole,
      members: unexpectedMembersForRole(
        cloudBuildSourceBucketIamPolicy,
        cloudBuildSourceBucketRole,
        expectedBuildServiceAccountUsers,
      ),
    });
  addCheck(
    "Cloud Build source bucket objectViewer is limited to build service account",
    cloudBuildSourceBucketErrors.length === 0,
    [
      `errors=${cloudBuildSourceBucketErrors.join(",") || "none"}`,
      `removeCommands=${cloudBuildSourceBucketRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );
  const expectedWifMember = `principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${wifPoolId}/attribute.repository_id/${githubRepositoryId}`;
  const wifImpersonators = membersForRole(
    buildServiceAccountIam,
    "roles/iam.workloadIdentityUser",
  );
  addCheck(
    "build service account is impersonated only by the configured GitHub repository",
    wifImpersonators.length > 0 &&
      wifImpersonators.every((member) => member === expectedWifMember),
    `impersonators=${wifImpersonators.join(",") || "none"} expected=${expectedWifMember}`,
  );
  const serviceAccountUsers = membersForRole(
    buildServiceAccountIam,
    "roles/iam.serviceAccountUser",
  );
  addCheck(
    "build service account can act as itself for user-specified Cloud Build",
    serviceAccountUsers.includes(expectedBuildServiceAccountUser),
    `members=${serviceAccountUsers.join(",") || "none"}`,
  );
  const buildServiceAccountActAsRemovalCommands =
    formatBuildServiceAccountActAsRemovalCommands(
      buildServiceAccount,
      projectId,
      serviceAccountUsers,
    );
  addCheck(
    "build service account actAs grant has only the build service account",
    serviceAccountUsers.length > 0 &&
      serviceAccountUsers.every((member) => {
        return member === expectedBuildServiceAccountUser;
      }),
    [
      `members=${serviceAccountUsers.join(",") || "none"}`,
      `expected=${expectedBuildServiceAccountUser}`,
      `removeCommands=${buildServiceAccountActAsRemovalCommands.join(" | ") || "none"}`,
    ].join(" "),
  );

  const buildServiceAccountKeys = tryRunGcloudJson([
    "iam",
    "service-accounts",
    "keys",
    "list",
    "--iam-account",
    buildServiceAccount,
    "--project",
    projectId,
    "--managed-by=user",
    "--format=json(name)",
  ]);
  const userManagedKeys = buildServiceAccountKeys.ok
    ? readRecords(buildServiceAccountKeys.value)
        .map((record) => record["name"])
        .filter((name): name is string => typeof name === "string")
    : [];
  addCheck(
    "build service account has no user-managed keys",
    buildServiceAccountKeys.ok && userManagedKeys.length === 0,
    detailForResult(
      buildServiceAccountKeys,
      `userManagedKeys=${userManagedKeys.join(",") || "none"}`,
    ),
  );

  const schedulerServiceAccountKeys = tryRunGcloudJson([
    "iam",
    "service-accounts",
    "keys",
    "list",
    "--iam-account",
    schedulerServiceAccount,
    "--project",
    projectId,
    "--managed-by=user",
    "--format=json(name)",
  ]);
  const schedulerUserManagedKeys = schedulerServiceAccountKeys.ok
    ? readRecords(schedulerServiceAccountKeys.value)
        .map((record) => record["name"])
        .filter((name): name is string => typeof name === "string")
    : [];
  addCheck(
    "scheduler service account has no user-managed keys",
    schedulerServiceAccountKeys.ok && schedulerUserManagedKeys.length === 0,
    detailForResult(
      schedulerServiceAccountKeys,
      `userManagedKeys=${schedulerUserManagedKeys.join(",") || "none"}`,
    ),
  );

  const cloudSchedulerJobs = tryRunGcloudJson([
    "scheduler",
    "jobs",
    "list",
    "--project",
    projectId,
    "--location",
    region,
    "--format=json(name,httpTarget.uri,httpTarget.headers,httpTarget.oidcToken)",
  ]);
  const cloudSchedulerOidcJobErrors = cloudSchedulerJobs.ok
    ? readCloudSchedulerOidcJobErrors(cloudSchedulerJobs.value, {
        publicDomain,
        schedulerServiceAccount,
      })
    : [];
  addCheck(
    "Cloud Scheduler cron jobs use Google OIDC tokens only",
    cloudSchedulerJobs.ok && cloudSchedulerOidcJobErrors.length === 0,
    detailForResult(
      cloudSchedulerJobs,
      `schedulerServiceAccount=${schedulerServiceAccount} audience=${publicDomain} errors=${cloudSchedulerOidcJobErrors.join(",") || "none"}`,
    ),
  );

  const cloudBuildTriggerResults = await auditCloudBuildTriggers(
    projectId,
    region,
  );
  const triggerNamesByLocation = cloudBuildTriggerResults.map((entry) => {
    return {
      location: entry.location,
      names: entry.names,
    };
  });
  const cloudBuildTriggerAuditErrors = cloudBuildTriggerResults.flatMap(
    (entry) => {
      if (entry.result.ok) return [];
      return [`${entry.location}: ${entry.result.error}`];
    },
  );
  const triggerNames = cloudBuildTriggerResults.flatMap((entry) => entry.names);
  const triggerDeletionCommands = formatCloudBuildTriggerDeletionCommands(
    projectId,
    triggerNamesByLocation,
  );
  addCheck(
    "legacy Cloud Build triggers are absent in all Cloud Build regions and global",
    cloudBuildTriggerAuditErrors.length === 0 && triggerNames.length === 0,
    cloudBuildTriggerAuditErrors.length > 0
      ? cloudBuildTriggerAuditErrors.join("; ")
      : [
          `triggers=${formatNamedResourcesByLocation(triggerNamesByLocation)}`,
          `deleteCommands=${triggerDeletionCommands.join(" | ") || "none"}`,
        ].join(" "),
  );

  const cloudBuildConnectionResults = await auditCloudBuildConnections(
    projectId,
    region,
  );
  const connectionNamesByLocation = cloudBuildConnectionResults.map((entry) => {
    return {
      location: entry.location,
      names: entry.names,
    };
  });
  const cloudBuildConnectionAuditErrors = cloudBuildConnectionResults.flatMap(
    (entry) => {
      if (entry.result.ok) return [];
      return [`${entry.location}: ${entry.result.error}`];
    },
  );
  const connectionNames = cloudBuildConnectionResults.flatMap((entry) => {
    return entry.names;
  });
  const connectionDeletionCommands = formatCloudBuildConnectionDeletionCommands(
    projectId,
    connectionNamesByLocation,
  );
  addCheck(
    "legacy Cloud Build GitHub connections are absent in all Cloud Build regions",
    cloudBuildConnectionAuditErrors.length === 0 &&
      connectionNames.length === 0,
    cloudBuildConnectionAuditErrors.length > 0
      ? cloudBuildConnectionAuditErrors.join("; ")
      : [
          `connections=${formatNamedResourcesByLocation(connectionNamesByLocation)}`,
          `deleteCommands=${connectionDeletionCommands.join(" | ") || "none"}`,
        ].join(" "),
  );

  console.log("GCP production IAP audit");
  console.log(`project=${projectId}`);
  console.log(`region=${region}`);
  console.log(`adminService=${adminService}`);
  console.log(`migrateJob=${migrateJobName}`);
  console.log(`expectedOrganization=${expectedOrganizationId}`);
  console.log(`expectedRoleGroups=${expectedRoleGroupEmails.join(",")}`);
  console.log(`cloudIdentityDomain=${cloudIdentityDomain}`);
  console.log(`runtimeServiceAccount=${runtimeServiceAccount}`);
  console.log(`buildServiceAccount=${buildServiceAccount}`);
  console.log(`schedulerServiceAccount=${schedulerServiceAccount}`);
  console.log(`githubRepository=${githubRepository}`);
  console.log(`githubRepositoryId=${githubRepositoryId}`);
  console.log(`githubRepositoryOwnerId=${githubRepositoryOwnerId}`);
  console.log(`wifProvider=${wifPoolId}/${wifProviderId}`);
  console.log("baseline=organization-backed Google Group IAP + WIF production");
  console.log("");

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
    console.log(`  ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(
      `\nFAIL: ${failed.length} production IAP audit check(s) failed.`,
    );
    process.exit(1);
  }

  console.log(
    "\nPASS: production posture matches the org-backed group IAP + WIF model.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
