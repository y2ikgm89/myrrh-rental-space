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

const gcloudBin = process.platform === "win32" ? "gcloud.cmd" : "gcloud";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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
    if (error instanceof Error && "stderr" in error) {
      const stderr = String((error as { stderr?: unknown }).stderr ?? "");
      throw new Error(
        `gcloud ${args.join(" ")} failed${stderr ? `: ${stderr.trim()}` : ""}`,
      );
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function normalizeGroupMember(value: string): string {
  return value.startsWith("group:") ? value : `group:${value}`;
}

function main(): void {
  const projectId = requireEnv("GCP_PROJECT_ID", process.env["PROJECT_ID"]);
  const region = requireEnv("REGION", "asia-northeast1");
  const publicService = requireEnv("SERVICE_NAME", "myrrh-rental-space");
  const adminService = requireEnv(
    "ADMIN_SERVICE_NAME",
    "myrrh-rental-space-admin",
  );
  const expectedGroup = normalizeGroupMember(requireEnv("IAP_ADMIN_GROUP"));
  const expectedOrganizationId = process.env["GCP_ORGANIZATION_ID"];

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
    "project is under a Google Cloud Organization",
    typeof organizationId === "string",
    typeof organizationId === "string"
      ? `organization=${organizationId}`
      : "no organization ancestor; create a Cloud Identity/Workspace org-backed project",
  );
  if (expectedOrganizationId) {
    addCheck(
      "project organization matches GCP_ORGANIZATION_ID",
      organizationId === expectedOrganizationId,
      `actual=${String(organizationId ?? "none")} expected=${expectedOrganizationId}`,
    );
  }

  addCheck(
    "IAP_ADMIN_GROUP is a Google Group IAM member",
    expectedGroup.startsWith("group:") && expectedGroup.includes("@"),
    expectedGroup,
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

  console.log("GCP production IAP audit");
  console.log(`project=${projectId}`);
  console.log(`region=${region}`);
  console.log(`adminService=${adminService}`);
  console.log(`expectedGroup=${expectedGroup}`);
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
    "\nPASS: production IAP posture matches the org-backed group model.",
  );
}

main();
