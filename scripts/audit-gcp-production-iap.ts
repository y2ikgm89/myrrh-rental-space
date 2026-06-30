import { execFileSync } from "node:child_process";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

type Binding = {
  role?: string;
  members?: string[];
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

const gcloudBin = process.platform === "win32" ? "gcloud.cmd" : "gcloud";

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

function requireGoogleGroupMember(value: string): string {
  if (!value.startsWith("group:") || !value.includes("@")) {
    throw new Error(
      "IAP_ADMIN_GROUP must be a Google Group IAM member like group:admins@example.com",
    );
  }
  return value;
}

function main(): void {
  const projectId = requireEnv("GCP_PROJECT_ID", process.env["PROJECT_ID"]);
  const region = requireEnv("REGION", "asia-northeast1");
  const publicService = requireEnv("SERVICE_NAME", "myrrh-rental-space");
  const adminService = requireEnv(
    "ADMIN_SERVICE_NAME",
    "myrrh-rental-space-admin",
  );
  const expectedGroup = requireGoogleGroupMember(requireEnv("IAP_ADMIN_GROUP"));
  const expectedOrganizationId = requireEnv("GCP_ORGANIZATION_ID");
  const cloudIdentityDomain = requireEnv("CLOUD_IDENTITY_DOMAIN");
  const buildServiceAccount = requireEnv(
    "BUILD_SERVICE_ACCOUNT",
    process.env["BUILD_SA"] ??
      `myrrh-rental-space-build@${projectId}.iam.gserviceaccount.com`,
  );
  const githubRepositoryId = requireEnv("GITHUB_REPOSITORY_ID");
  const wifPoolId = requireEnv("WIF_POOL_ID", "github-actions");
  const wifProviderId = requireEnv(
    "WIF_PROVIDER_ID",
    "github-myrrh-rental-space",
  );

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
    "IAP_ADMIN_GROUP is a Google Group IAM member",
    expectedGroup.startsWith("group:") && expectedGroup.includes("@"),
    expectedGroup,
  );

  const expectedGroupEmail = expectedGroup.slice("group:".length);
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
    "configured IAP Google Group exists in Cloud Identity",
    groupDescription.ok &&
      typeof groupName === "string" &&
      groupKeyId === expectedGroupEmail,
    detailForResult(
      groupDescription,
      `group=${String(groupKeyId ?? "missing")} name=${String(groupName ?? "missing")} domain=${cloudIdentityDomain}`,
    ),
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
  addCheck(
    "IAP access is granted to the configured Google Group",
    iapAccessors.includes(expectedGroup),
    `accessors=${iapAccessors.join(",") || "none"} expected=${expectedGroup}`,
  );
  addCheck(
    "IAP access has no individual or public grants",
    iapAccessors.length > 0 &&
      iapAccessors.every((member) => member.startsWith("group:")),
    `accessors=${iapAccessors.join(",") || "none"}`,
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
    wifProvider.ok &&
      typeof wifProviderCondition === "string" &&
      wifProviderCondition.includes(
        `assertion.repository_id == '${githubRepositoryId}'`,
      ) &&
      wifProviderCondition.includes("assertion.ref == 'refs/heads/main'"),
    detailForResult(
      wifProvider,
      `condition=${String(wifProviderCondition ?? "missing")}`,
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

  const cloudBuildTriggers = tryRunGcloudJson([
    "builds",
    "triggers",
    "list",
    "--project",
    projectId,
    "--region",
    region,
    "--format=json(id,name)",
  ]);
  const triggerNames = cloudBuildTriggers.ok
    ? readRecords(cloudBuildTriggers.value)
        .map((record) => {
          const name = record["name"];
          const id = record["id"];
          if (typeof name === "string") return name;
          if (typeof id === "string") return id;
          return null;
        })
        .filter((name): name is string => name !== null)
    : [];
  addCheck(
    "legacy Cloud Build triggers are absent",
    cloudBuildTriggers.ok && triggerNames.length === 0,
    detailForResult(
      cloudBuildTriggers,
      `triggers=${triggerNames.join(",") || "none"}`,
    ),
  );

  const cloudBuildConnections = tryRunGcloudJson([
    "builds",
    "connections",
    "list",
    "--project",
    projectId,
    "--region",
    region,
    "--format=json(name)",
  ]);
  const connectionNames = cloudBuildConnections.ok
    ? readRecords(cloudBuildConnections.value)
        .map((record) => record["name"])
        .filter((name): name is string => typeof name === "string")
    : [];
  addCheck(
    "legacy Cloud Build GitHub connections are absent",
    cloudBuildConnections.ok && connectionNames.length === 0,
    detailForResult(
      cloudBuildConnections,
      `connections=${connectionNames.join(",") || "none"}`,
    ),
  );

  console.log("GCP production IAP audit");
  console.log(`project=${projectId}`);
  console.log(`region=${region}`);
  console.log(`adminService=${adminService}`);
  console.log(`expectedOrganization=${expectedOrganizationId}`);
  console.log(`expectedGroup=${expectedGroup}`);
  console.log(`cloudIdentityDomain=${cloudIdentityDomain}`);
  console.log(`buildServiceAccount=${buildServiceAccount}`);
  console.log(`githubRepositoryId=${githubRepositoryId}`);
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

main();
