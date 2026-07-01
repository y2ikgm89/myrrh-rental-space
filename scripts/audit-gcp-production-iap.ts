import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import {
  formatNamedResourcesByLocation,
  getCloudBuildConnectionAuditLocations,
  getCloudBuildTriggerAuditLocations,
  getProductionHttpAuditTargets,
  readAmbiguousAdminRolePrincipalErrors,
  readBroadProjectIamDeployGrantErrors,
  readBuildServiceAccountProjectIamRoleErrors,
  readProductionDomainConfigErrors,
  readProductionHttpTargetError,
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

const gcloudBin = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
const execFileAsync = promisify(execFile);

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function formatGcloudError(args: string[], error: unknown): string {
  if (error instanceof Error && "stderr" in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    return `gcloud ${args.join(" ")} failed${stderr ? `: ${stderr.trim()}` : ""}`;
  }
  return `gcloud ${args.join(" ")} failed: ${String(error)}`;
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
  const email = value.startsWith("group:")
    ? value.slice("group:".length)
    : value;
  if (!email.includes("@")) {
    throw new Error(
      `${name} must be a Google Group email like admins@example.com`,
    );
  }
  return email;
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
  const projectId = requireEnv("GCP_PROJECT_ID", process.env["PROJECT_ID"]);
  const region = requireEnv("REGION", "asia-northeast1");
  const publicService = requireEnv("SERVICE_NAME", "myrrh-rental-space");
  const adminService = requireEnv(
    "ADMIN_SERVICE_NAME",
    "myrrh-rental-space-admin",
  );
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
  const buildServiceAccount = requireEnv(
    "BUILD_SERVICE_ACCOUNT",
    process.env["BUILD_SA"] ??
      `myrrh-rental-space-build@${projectId}.iam.gserviceaccount.com`,
  );
  const runtimeServiceAccount = requireEnv(
    "RUNTIME_SERVICE_ACCOUNT",
    process.env["RUNTIME_SA"] ??
      `myrrh-rental-space-runtime@${projectId}.iam.gserviceaccount.com`,
  );
  const githubRepositoryId = requireEnv("GITHUB_REPOSITORY_ID");
  const githubRepositoryOwnerId = requireEnv("GITHUB_REPOSITORY_OWNER_ID");
  const githubRepository = requireEnv("GITHUB_REPOSITORY");
  const wifPoolId = requireEnv("WIF_POOL_ID", "github-actions");
  const wifProviderId = requireEnv(
    "WIF_PROVIDER_ID",
    "github-myrrh-rental-space",
  );
  const publicDomain = requireEnv("PUBLIC_DOMAIN");
  const adminDomain = requireEnv("ADMIN_DOMAIN");

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
    addCheck(
      `runtime service account owns role Google Group: ${expectedGroupEmail}`,
      groupMemberships.ok && runtimeMembershipRoles.includes("OWNER"),
      detailForResult(
        groupMemberships,
        `runtime=${runtimeServiceAccount} roles=${runtimeMembershipRoles.join(",") || "none"}`,
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

  const adminRunIam = readBindings(
    runGcloudJson([
      "run",
      "services",
      "get-iam-policy",
      adminService,
      "--project",
      projectId,
      "--region",
      region,
      "--format=json",
    ]),
  );
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
    runGcloudJson([
      "iap",
      "web",
      "get-iam-policy",
      "--project",
      projectId,
      "--region",
      region,
      "--resource-type=cloud-run",
      "--service",
      adminService,
      "--format=json",
    ]),
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

  const publicRunIam = readBindings(
    runGcloudJson([
      "run",
      "services",
      "get-iam-policy",
      publicService,
      "--project",
      projectId,
      "--region",
      region,
      "--format=json",
    ]),
  );
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

  const buildServiceAccountIam = readBindings(
    runGcloudJson([
      "iam",
      "service-accounts",
      "get-iam-policy",
      buildServiceAccount,
      "--project",
      projectId,
      "--format=json",
    ]),
  );
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
  const expectedBuildServiceAccountUser = `serviceAccount:${buildServiceAccount}`;
  addCheck(
    "build service account can act as itself for user-specified Cloud Build",
    serviceAccountUsers.includes(expectedBuildServiceAccountUser),
    `members=${serviceAccountUsers.join(",") || "none"}`,
  );
  addCheck(
    "build service account actAs grant has no individual users",
    serviceAccountUsers.length > 0 &&
      serviceAccountUsers.every((member) => {
        return member === expectedBuildServiceAccountUser;
      }),
    `members=${serviceAccountUsers.join(",") || "none"} expected=${expectedBuildServiceAccountUser}`,
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
  addCheck(
    "legacy Cloud Build triggers are absent in all Cloud Build regions and global",
    cloudBuildTriggerAuditErrors.length === 0 && triggerNames.length === 0,
    cloudBuildTriggerAuditErrors.length > 0
      ? cloudBuildTriggerAuditErrors.join("; ")
      : `triggers=${formatNamedResourcesByLocation(triggerNamesByLocation)}`,
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
  addCheck(
    "legacy Cloud Build GitHub connections are absent in all Cloud Build regions",
    cloudBuildConnectionAuditErrors.length === 0 &&
      connectionNames.length === 0,
    cloudBuildConnectionAuditErrors.length > 0
      ? cloudBuildConnectionAuditErrors.join("; ")
      : `connections=${formatNamedResourcesByLocation(connectionNamesByLocation)}`,
  );

  console.log("GCP production IAP audit");
  console.log(`project=${projectId}`);
  console.log(`region=${region}`);
  console.log(`adminService=${adminService}`);
  console.log(`expectedOrganization=${expectedOrganizationId}`);
  console.log(`expectedRoleGroups=${expectedRoleGroupEmails.join(",")}`);
  console.log(`cloudIdentityDomain=${cloudIdentityDomain}`);
  console.log(`runtimeServiceAccount=${runtimeServiceAccount}`);
  console.log(`buildServiceAccount=${buildServiceAccount}`);
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
