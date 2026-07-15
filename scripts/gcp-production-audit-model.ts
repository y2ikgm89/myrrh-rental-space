type NamedResourcesByLocation = {
  location: string;
  names: string[];
};

type WifProviderConditionIdentity = {
  repository: string;
  repositoryId: string;
  repositoryOwnerId: string;
};

export type AdminRoleGroupMembership = {
  groupEmail: string;
  memberEmail: string;
  memberType?: string;
};

type ProductionDomainConfig = {
  publicDomain: string;
  adminDomain: string;
};

type CloudSchedulerOidcAuditConfig = {
  publicDomain: string;
  schedulerServiceAccount: string;
  expectedJobIds?: readonly string[];
};

type CloudRunRuntimeEnvAuditConfig = {
  serviceName: string;
  expectedEnv: Record<string, string>;
  requiredSecretEnvRefs?: readonly CloudRunSecretEnvRef[];
  forbiddenEnvNames?: readonly string[];
};

type CloudRunIngressAuditConfig = {
  serviceName: string;
  expectedIngress: "all" | "internal" | "internal-and-cloud-load-balancing";
};

type CloudRunDefaultUrlAuditConfig = {
  serviceName: string;
  expectedDisabled: boolean;
};

type CloudRunServiceIdentityAuditConfig = {
  resourceName: string;
  expectedServiceAccount: string;
};

type CloudRunContainerCommandAuditConfig = {
  resourceName: string;
  expectedCommand: readonly string[];
  expectedArgs: readonly string[];
};

type CloudRunSecretEnvRef = {
  name: string;
  version: string;
};

type IamRoleMembershipAuditConfig = {
  resourceName: string;
  role: string;
  expectedMembers: readonly string[];
  allowAdditionalMembers?: boolean;
};

type IamPolicyBindingRemovalCommandConfig = {
  baseCommand: string;
  role: string;
  members: readonly string[];
  additionalArgs?: readonly string[];
};

type CloudRunSecretEnvBinding = {
  secret: string;
  version: string | null;
};

type SecretManagerSecretAccessorPolicyConfig = {
  secretName: string;
  expectedMembers: readonly string[];
};

type SecretManagerSecretAccessorMembersConfig = {
  secretName: string;
  runtimeServiceAccount: string;
  buildServiceAccount: string;
};

const EXPECTED_PRODUCTION_DOMAINS = {
  PUBLIC_DOMAIN: "https://rental-space.myrrh-jp.com",
  ADMIN_DOMAIN: "https://admin.myrrh-jp.com",
} as const;

export type ProductionHttpAuditTarget = {
  name: string;
  url: string;
  expectedStatus: number;
  expectedRedirectHost?: string;
};

type ProductionHttpAuditResponse = {
  status: number;
  redirectUrl: string | null;
};

const CLOUD_BUILD_REGIONS = [
  "africa-south1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "asia-southeast3",
  "australia-southeast1",
  "australia-southeast2",
  "europe-central2",
  "europe-north1",
  "europe-north2",
  "europe-southwest1",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west10",
  "europe-west12",
  "me-central1",
  "me-central2",
  "me-west1",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "northamerica-south1",
  "southamerica-east1",
  "southamerica-west1",
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-south1",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
] as const;

// SSoT: `terraform/cloud_scheduler.tf` `local.cron_jobs` の name field 全て。
// 追加時は Terraform 側の for_each で `google_cloud_scheduler_job.job[...]` が
// 自動作成され、post-merge terraform-apply で GCP に反映される。本 list は
// 完全同期契約 (drift-detect gate に相当、audit で unexpected/missing を検出)。
export const REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS = [
  "calendar-sync",
  "customer-risk-scan",
  "data-retention",
  "event-import",
  "event-reminder",
  "faq-stale-check",
  "faq-trash-cleanup",
  "instagram-refresh",
  "instagram-sync",
  "notification-cleanup",
  "pending-reservation-expire",
  "receipt-backfill",
  "reservation-reminder",
  "smart-lock-cleanup",
  "waitlist-expire",
] as const;

export const REQUIRED_CLOUD_RUN_SECRET_ENV_REFS = [
  { name: "DATABASE_URL", version: "1" },
  { name: "BETTER_AUTH_SECRET", version: "1" },
  { name: "ENCRYPTION_KEY", version: "1" },
  { name: "AUDIT_LOG_HMAC_KEY", version: "1" },
  { name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", version: "1" },
  { name: "R2_ACCOUNT_ID", version: "1" },
  { name: "R2_ACCESS_KEY_ID", version: "1" },
  { name: "R2_SECRET_ACCESS_KEY", version: "1" },
  { name: "R2_BUCKET_NAME", version: "1" },
  { name: "R2_PUBLIC_URL", version: "1" },
  { name: "CLOUDFLARE_ZONE_ID", version: "1" },
  { name: "CLOUDFLARE_API_TOKEN", version: "1" },
  { name: "CLOUDFLARE_ORIGIN_HEADER_SECRET", version: "1" },
  { name: "GOOGLE_CLIENT_ID", version: "1" },
  { name: "GOOGLE_CLIENT_SECRET", version: "1" },
] as const satisfies readonly CloudRunSecretEnvRef[];

export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS = [
  { name: "DATABASE_URL", version: "1" },
] as const satisfies readonly CloudRunSecretEnvRef[];

export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND = ["bunx"] as const;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS = [
  "--bun",
  "prisma",
  "migrate",
  "deploy",
] as const;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_TASK_COUNT = 1;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_PARALLELISM = 1;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_MAX_RETRIES = 0;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_TIMEOUT_SECONDS = 600;
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_MEMORY_LIMIT = "1Gi";
export const REQUIRED_CLOUD_RUN_MIGRATE_JOB_CPU_LIMIT = "1";

function uniqueLocations(locations: string[]): string[] {
  return [
    ...new Set(
      locations
        .map((location) => location.trim())
        .filter((location) => location.length > 0),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

export function getCloudBuildTriggerAuditLocations(region: string): string[] {
  return uniqueLocations([region, "global", ...CLOUD_BUILD_REGIONS]);
}

export function getCloudBuildConnectionAuditLocations(
  region: string,
): string[] {
  return uniqueLocations([region, ...CLOUD_BUILD_REGIONS]).filter(
    (location) => location !== "global",
  );
}

export function getIapCloudRunServiceIamPolicyUrl(
  projectNumber: string,
  region: string,
  service: string,
): string {
  return `https://iap.googleapis.com/v1/projects/${projectNumber}/iap_web/cloud_run-${region}/services/${service}:getIamPolicy`;
}

export function readCloudBuildTriggerIdentifiers(value: unknown): string[] {
  return readRecords(value)
    .map((record) => {
      const name = record["name"];
      const id = record["id"];
      if (typeof name === "string") return name;
      if (typeof id === "string") return id;
      return null;
    })
    .filter((name): name is string => name !== null);
}

export function formatNamedResourcesByLocation(
  resourcesByLocation: NamedResourcesByLocation[],
): string {
  const formatted = resourcesByLocation.flatMap((entry) => {
    return entry.names.map((name) => `${entry.location}/${name}`);
  });
  return formatted.join(",") || "none";
}

export function formatCloudBuildTriggerDeletionCommands(
  projectId: string,
  resourcesByLocation: NamedResourcesByLocation[],
): string[] {
  return resourcesByLocation.flatMap((entry) => {
    return entry.names.map((name) => {
      return [
        `gcloud builds triggers delete "${name}"`,
        `  --project="${projectId}"`,
        `  --region="${entry.location}"`,
        "  --quiet",
      ].join(" \\\n");
    });
  });
}

export function formatCloudBuildConnectionDeletionCommands(
  projectId: string,
  resourcesByLocation: NamedResourcesByLocation[],
): string[] {
  return resourcesByLocation.flatMap((entry) => {
    return entry.names.map((name) => {
      return [
        `gcloud builds connections delete "${name}"`,
        `  --project="${projectId}"`,
        `  --region="${entry.location}"`,
        "  --quiet",
      ].join(" \\\n");
    });
  });
}

export function formatCloudRunRevisionDeletionCommands(
  projectId: string,
  region: string,
  revisionNames: readonly string[],
): string[] {
  return revisionNames.map((revisionName) => {
    return [
      `gcloud run revisions delete "${revisionName}"`,
      `  --project="${projectId}"`,
      `  --region="${region}"`,
      "  --quiet",
    ].join(" \\\n");
  });
}

export function formatBuildServiceAccountActAsRemovalCommands(
  buildServiceAccount: string,
  projectId: string,
  members: string[],
): string[] {
  const expectedMember = `serviceAccount:${buildServiceAccount}`;
  return members
    .filter((member) => member !== expectedMember)
    .map((member) => {
      return [
        `gcloud iam service-accounts remove-iam-policy-binding "${buildServiceAccount}"`,
        `  --project="${projectId}"`,
        `  --member="${member}"`,
        '  --role="roles/iam.serviceAccountUser"',
        "  --condition=None",
      ].join(" \\\n");
    });
}

export function formatRuntimeGroupOwnerRepairCommands(
  groupEmail: string,
  runtimeServiceAccount: string,
): string[] {
  return [
    [
      "gcloud identity groups memberships add",
      `  --group-email="${groupEmail}"`,
      `  --member-email="${runtimeServiceAccount}"`,
      "  --quiet || true",
    ].join(" \\\n"),
    [
      "gcloud identity groups memberships modify-membership-roles",
      `  --group-email="${groupEmail}"`,
      `  --member-email="${runtimeServiceAccount}"`,
      "  --add-roles=OWNER",
      "  --quiet || true",
    ].join(" \\\n"),
  ];
}

export function formatSecretManagerSecretAccessorRemovalCommands(
  projectId: string,
  secretName: string,
  members: readonly string[],
): string[] {
  return members.map((member) => {
    return [
      `gcloud secrets remove-iam-policy-binding "${secretName}"`,
      `  --project="${projectId}"`,
      `  --member="${member}"`,
      '  --role="roles/secretmanager.secretAccessor"',
      "  --condition=None",
    ].join(" \\\n");
  });
}

export function formatIamPolicyBindingRemovalCommands(
  config: IamPolicyBindingRemovalCommandConfig,
): string[] {
  const additionalArgs = config.additionalArgs ?? [];
  return [...config.members].sort().map((member) => {
    return [
      config.baseCommand,
      ...additionalArgs,
      `  --member="${member}"`,
      `  --role="${config.role}"`,
      "  --condition=None",
    ].join(" \\\n");
  });
}

export function readIamPolicyMembersForRole(
  value: unknown,
  role: string,
): string[] {
  if (!isRecord(value)) return [];
  const bindings = value["bindings"];
  if (!Array.isArray(bindings)) return [];

  return bindings.filter(isRecord).flatMap((binding) => {
    if (binding["role"] !== role) return [];
    const members = binding["members"];
    if (!Array.isArray(members)) return [];
    return members.filter((member): member is string => {
      return typeof member === "string";
    });
  });
}

export function readIamRoleMembershipErrors(
  value: unknown,
  config: IamRoleMembershipAuditConfig,
): string[] {
  if (!isRecord(value)) {
    return [`${config.resourceName} IAM policy metadata is missing`];
  }

  const bindings = value["bindings"];
  const roleBindings = Array.isArray(bindings)
    ? bindings.filter((binding): binding is Record<string, unknown> => {
        return isRecord(binding) && binding["role"] === config.role;
      })
    : [];
  const unconditionalMembers = new Set<string>();
  const allMembers = new Set<string>();
  let hasConditionalBinding = false;

  for (const binding of roleBindings) {
    const members = binding["members"];
    const memberNames = Array.isArray(members)
      ? members.filter((member): member is string => typeof member === "string")
      : [];
    const hasCondition = isRecord(binding["condition"]);
    if (hasCondition) {
      hasConditionalBinding = true;
    }
    for (const member of memberNames) {
      allMembers.add(member);
      if (!hasCondition) {
        unconditionalMembers.add(member);
      }
    }
  }

  const expectedMembers = [...config.expectedMembers].sort();
  const expectedMemberSet = new Set(expectedMembers);
  const missingErrors = expectedMembers.flatMap((member) => {
    return unconditionalMembers.has(member)
      ? []
      : [`${config.resourceName} ${config.role} missing ${member}`];
  });
  const unexpectedErrors = config.allowAdditionalMembers
    ? []
    : [...allMembers]
        .filter((member) => !expectedMemberSet.has(member))
        .sort()
        .map((member) => {
          return `${config.resourceName} ${config.role} unexpected ${member}`;
        });
  const conditionalErrors = hasConditionalBinding
    ? [`${config.resourceName} ${config.role} must not use IAM Conditions`]
    : [];

  return [...missingErrors, ...unexpectedErrors, ...conditionalErrors];
}

export function readBroadProjectIamDeployGrantErrors(value: unknown): string[] {
  return [
    "roles/iam.serviceAccountTokenCreator",
    "roles/iam.serviceAccountUser",
    "roles/iam.workloadIdentityUser",
  ]
    .flatMap((role) => {
      return readIamPolicyMembersForRole(value, role).map((member) => {
        return `${role}:${member}`;
      });
    })
    .sort();
}

export function readBuildServiceAccountProjectIamRoleErrors(
  value: unknown,
  buildServiceAccount: string,
): string[] {
  const member = `serviceAccount:${buildServiceAccount}`;
  const requiredRoles = [
    "roles/cloudbuild.builds.builder",
    "roles/logging.logWriter",
  ];
  const forbiddenBroadRoles = ["roles/iap.admin", "roles/run.admin"];

  const missingRoleErrors = requiredRoles.flatMap((role) => {
    return readIamPolicyMembersForRole(value, role).includes(member)
      ? []
      : [`${role} missing for ${member}`];
  });
  const forbiddenRoleErrors = forbiddenBroadRoles.flatMap((role) => {
    return readIamPolicyMembersForRole(value, role).includes(member)
      ? [`${role} must not be project-level for ${member}`]
      : [];
  });

  return [...missingRoleErrors, ...forbiddenRoleErrors];
}

export function readAmbiguousAdminRolePrincipalErrors(
  memberships: AdminRoleGroupMembership[],
): string[] {
  const groupsByMember = new Map<string, Set<string>>();

  for (const membership of memberships) {
    if (membership.memberType === "SERVICE_ACCOUNT") continue;

    const memberEmail = membership.memberEmail.trim().toLowerCase();
    const groupEmail = membership.groupEmail.trim().toLowerCase();
    if (!memberEmail || !groupEmail) continue;

    const groups = groupsByMember.get(memberEmail) ?? new Set<string>();
    groups.add(groupEmail);
    groupsByMember.set(memberEmail, groups);
  }

  return [...groupsByMember.entries()]
    .filter(([, groups]) => groups.size > 1)
    .map(([memberEmail, groups]) => {
      return `${memberEmail}:${[...groups].sort().join(",")}`;
    })
    .sort();
}

export function readProjectSecretManagerAccessorErrors(
  value: unknown,
  expectedMembers: readonly string[] = [],
): string[] {
  // F1 refactor (PR #1073、2026-07-14) 以降、runtime-sa / build-sa への
  // `roles/secretmanager.secretAccessor` は **project-level SSoT** で bootstrap-
  // terraform.sh が SSoT (旧 secret_iam.tf は削除済)。per-secret 個別 binding は
  // Terraform 側で廃止した。expected members を渡された時はそれを許容し、
  // 想定外の member のみ error として返す。
  //
  // 未指定時 (後方互換): 全 project-level member を error 扱いする旧挙動。
  const expectedSet = new Set(expectedMembers);
  return readIamPolicyMembersForRole(
    value,
    "roles/secretmanager.secretAccessor",
  )
    .filter((member) => !expectedSet.has(member))
    .sort()
    .map((member) => {
      return `roles/secretmanager.secretAccessor project-level grant must be removed for ${member}`;
    });
}

export function getExpectedSecretManagerSecretAccessorMembers(
  config: SecretManagerSecretAccessorMembersConfig,
): string[] {
  const runtimeMember = `serviceAccount:${config.runtimeServiceAccount}`;
  const buildMember = `serviceAccount:${config.buildServiceAccount}`;
  const members =
    config.secretName === "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"
      ? [buildMember, runtimeMember]
      : [runtimeMember];
  return [...members].sort();
}

export function readSecretManagerSecretAccessorPolicyErrors(
  value: unknown,
  config: SecretManagerSecretAccessorPolicyConfig,
): string[] {
  if (!isRecord(value)) {
    return [
      `${config.secretName} Secret Manager IAM policy metadata is missing`,
    ];
  }

  const bindings = value["bindings"];
  const secretAccessorBindings = Array.isArray(bindings)
    ? bindings.filter((binding): binding is Record<string, unknown> => {
        return (
          isRecord(binding) &&
          binding["role"] === "roles/secretmanager.secretAccessor"
        );
      })
    : [];
  const unconditionalMembers = new Set<string>();
  const allMembers = new Set<string>();
  let hasConditionalBinding = false;

  for (const binding of secretAccessorBindings) {
    const members = binding["members"];
    const memberNames = Array.isArray(members)
      ? members.filter((member): member is string => typeof member === "string")
      : [];
    const hasCondition = isRecord(binding["condition"]);
    if (hasCondition) {
      hasConditionalBinding = true;
    }
    for (const member of memberNames) {
      allMembers.add(member);
      if (!hasCondition) {
        unconditionalMembers.add(member);
      }
    }
  }

  const expectedMembers = [...config.expectedMembers].sort();
  const expectedMemberSet = new Set(expectedMembers);
  const missingErrors = expectedMembers.flatMap((member) => {
    return unconditionalMembers.has(member)
      ? []
      : [
          `${config.secretName} roles/secretmanager.secretAccessor missing ${member}`,
        ];
  });
  const unexpectedErrors = [...allMembers]
    .filter((member) => !expectedMemberSet.has(member))
    .sort()
    .map((member) => {
      return `${config.secretName} roles/secretmanager.secretAccessor unexpected ${member}`;
    });
  const conditionalErrors = hasConditionalBinding
    ? [
        `${config.secretName} roles/secretmanager.secretAccessor must not use IAM Conditions`,
      ]
    : [];

  return [...missingErrors, ...unexpectedErrors, ...conditionalErrors];
}

export function readUnexpectedSecretManagerSecretAccessorMembers(
  value: unknown,
  expectedMembers: readonly string[],
): string[] {
  if (!isRecord(value)) return [];
  const expectedMemberSet = new Set(expectedMembers);
  return readIamPolicyMembersForRole(
    value,
    "roles/secretmanager.secretAccessor",
  )
    .filter((member) => !expectedMemberSet.has(member))
    .sort();
}

function readCloudRunRuntimeEnvMap(value: unknown): Map<string, string> {
  const env = readCloudRunRuntimeEnvRecords(value);

  return new Map(
    env.flatMap((entry) => {
      const name = entry["name"];
      const value = entry["value"];
      if (typeof name !== "string" || typeof value !== "string") {
        return [];
      }
      return [[name, value] as const];
    }),
  );
}

function readCloudRunRuntimeEnvNames(value: unknown): Set<string> {
  return new Set(
    readCloudRunRuntimeEnvRecords(value).flatMap((entry) => {
      const name = entry["name"];
      return typeof name === "string" ? [name] : [];
    }),
  );
}

function readCloudRunRuntimeEnvRecords(
  value: unknown,
): Record<string, unknown>[] {
  const firstContainer = readCloudRunFirstContainer(value);
  if (!firstContainer) return [];
  const env = firstContainer["env"];
  if (!Array.isArray(env)) return [];
  return env.filter(isRecord);
}

function readCloudRunFirstContainer(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const containerPaths = [
    ["spec", "template", "spec", "containers"],
    ["spec", "template", "spec", "template", "spec", "containers"],
    ["template", "containers"],
    ["template", "template", "containers"],
  ] as const;

  for (const path of containerPaths) {
    let current: unknown = value;
    for (const segment of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[segment];
    }

    if (!Array.isArray(current)) continue;
    const firstContainer = current.find(isRecord);
    if (firstContainer) return firstContainer;
  }

  return null;
}

function readValueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function readCloudRunSecretKeyRefBinding(
  secretKeyRef: Record<string, unknown>,
): CloudRunSecretEnvBinding | null {
  const v1Name = secretKeyRef["name"];
  const v2Secret = secretKeyRef["secret"];
  const secret =
    typeof v1Name === "string" && v1Name.length > 0
      ? v1Name
      : typeof v2Secret === "string" && v2Secret.length > 0
        ? v2Secret
        : null;
  if (secret === null) {
    return null;
  }

  const v1Key = secretKeyRef["key"];
  const v2Version = secretKeyRef["version"];
  const version =
    typeof v1Key === "string" && v1Key.length > 0
      ? v1Key
      : typeof v2Version === "string" && v2Version.length > 0
        ? v2Version
        : null;

  return { secret, version };
}

function readCloudRunRuntimeSecretEnvBinding(
  entry: Record<string, unknown>,
): CloudRunSecretEnvBinding | null {
  const valueFrom = entry["valueFrom"];
  const valueSource = entry["valueSource"];
  const secretKeyRef =
    (isRecord(valueFrom) && valueFrom["secretKeyRef"]) ||
    (isRecord(valueSource) && valueSource["secretKeyRef"]);

  if (!isRecord(secretKeyRef)) return null;

  return readCloudRunSecretKeyRefBinding(secretKeyRef);
}

function readCloudRunRuntimeSecretEnvRefs(
  value: unknown,
): Map<string, CloudRunSecretEnvBinding> {
  return new Map(
    readCloudRunRuntimeEnvRecords(value).flatMap((entry) => {
      const name = entry["name"];
      if (typeof name !== "string") return [];
      const binding = readCloudRunRuntimeSecretEnvBinding(entry);
      return binding === null ? [] : [[name, binding] as const];
    }),
  );
}

export function readCloudRunRuntimeEnvErrors(
  value: unknown,
  config: CloudRunRuntimeEnvAuditConfig,
): string[] {
  const actualEnv = readCloudRunRuntimeEnvMap(value);
  const actualEnvNames = readCloudRunRuntimeEnvNames(value);
  const actualSecretEnvRefs = readCloudRunRuntimeSecretEnvRefs(value);

  const missingOrWrongEnvErrors = Object.entries(config.expectedEnv).flatMap(
    ([name, expectedValue]) => {
      if (!actualEnv.has(name)) {
        return [`${config.serviceName} ${name} is missing`];
      }
      const actualValue = actualEnv.get(name);
      if (actualValue !== expectedValue) {
        return [`${config.serviceName} ${name} must be ${expectedValue}`];
      }
      return [];
    },
  );
  const forbiddenEnvErrors = (config.forbiddenEnvNames ?? []).flatMap(
    (name) => {
      return actualEnvNames.has(name)
        ? [`${config.serviceName} ${name} must be removed`]
        : [];
    },
  );
  const missingSecretEnvErrors = (config.requiredSecretEnvRefs ?? []).flatMap(
    (expectedRef) => {
      if (!actualEnvNames.has(expectedRef.name)) {
        return [
          `${config.serviceName} ${expectedRef.name} secret binding is missing`,
        ];
      }
      const actualRef = actualSecretEnvRefs.get(expectedRef.name);
      if (!actualRef) {
        return [
          `${config.serviceName} ${expectedRef.name} must be bound from Secret Manager`,
        ];
      }
      if (actualRef.secret !== expectedRef.name) {
        return [
          `${config.serviceName} ${expectedRef.name} must reference Secret Manager secret ${expectedRef.name}`,
        ];
      }
      if (actualRef.version !== expectedRef.version) {
        return [
          `${config.serviceName} ${expectedRef.name} must reference Secret Manager version ${expectedRef.version}`,
        ];
      }
      return [];
    },
  );

  return [
    ...missingOrWrongEnvErrors,
    ...forbiddenEnvErrors,
    ...missingSecretEnvErrors,
  ];
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry): entry is string => typeof entry === "string")) {
    return null;
  }
  return value;
}

function stringArraysEqual(
  actual: readonly string[] | null,
  expected: readonly string[],
): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return expected.every(
    (expectedValue, index) => actual[index] === expectedValue,
  );
}

export function readCloudRunContainerCommandErrors(
  value: unknown,
  config: CloudRunContainerCommandAuditConfig,
): string[] {
  const container = readCloudRunFirstContainer(value);
  if (!container) return [`${config.resourceName} container is missing`];

  const actualCommand = readStringArray(container["command"]);
  const actualArgs = readStringArray(container["args"]);
  const errors: string[] = [];

  if (!stringArraysEqual(actualCommand, config.expectedCommand)) {
    errors.push(
      `${config.resourceName} command must be ${JSON.stringify(config.expectedCommand)}, got ${JSON.stringify(actualCommand ?? null)}`,
    );
  }
  if (!stringArraysEqual(actualArgs, config.expectedArgs)) {
    errors.push(
      `${config.resourceName} args must be ${JSON.stringify(config.expectedArgs)}, got ${JSON.stringify(actualArgs ?? null)}`,
    );
  }

  return errors;
}

function readIntegerAtPaths(
  value: unknown,
  paths: readonly (readonly string[])[],
): number | null {
  for (const path of paths) {
    const rawValue = readValueAtPath(value, path);
    if (typeof rawValue === "number" && Number.isInteger(rawValue)) {
      return rawValue;
    }
    if (typeof rawValue === "string" && /^\d+$/u.test(rawValue)) {
      return Number(rawValue);
    }
  }
  return null;
}

function readDurationSecondsAtPaths(
  value: unknown,
  paths: readonly (readonly string[])[],
): number | null {
  for (const path of paths) {
    const rawValue = readValueAtPath(value, path);
    if (typeof rawValue === "number" && Number.isInteger(rawValue)) {
      return rawValue;
    }
    if (typeof rawValue !== "string") continue;
    if (/^\d+$/u.test(rawValue)) return Number(rawValue);
    const secondsMatch = /^(\d+)s$/u.exec(rawValue);
    if (secondsMatch) return Number(secondsMatch[1]);
  }
  return null;
}

function readCloudRunContainerResourceLimit(
  value: unknown,
  limitName: "cpu" | "memory",
): string | null {
  const container = readCloudRunFirstContainer(value);
  if (!container) return null;
  const resources = container["resources"];
  if (!isRecord(resources)) return null;
  const limits = resources["limits"];
  if (!isRecord(limits)) return null;
  const limit = limits[limitName];
  return typeof limit === "string" && limit.length > 0 ? limit : null;
}

function formatExpectedActualNumberError(
  resourceName: string,
  fieldName: string,
  expected: number,
  actual: number | null,
): string[] {
  return actual === expected
    ? []
    : [
        `${resourceName} ${fieldName} must be ${expected}, got ${String(actual ?? "missing")}`,
      ];
}

function formatExpectedActualStringError(
  resourceName: string,
  fieldName: string,
  expected: string,
  actual: string | null,
): string[] {
  return actual === expected
    ? []
    : [
        `${resourceName} ${fieldName} must be ${expected}, got ${actual ?? "missing"}`,
      ];
}

function readCloudRunMetadataAnnotation(
  value: unknown,
  annotationName: string,
): string | null {
  const annotations = readValueAtPath(value, ["metadata", "annotations"]);
  if (!isRecord(annotations)) return null;
  const annotationValue = annotations[annotationName];
  return typeof annotationValue === "string" && annotationValue.length > 0
    ? annotationValue
    : null;
}

export function readCloudRunIngressErrors(
  value: unknown,
  config: CloudRunIngressAuditConfig,
): string[] {
  return [
    ...formatExpectedActualStringError(
      config.serviceName,
      "ingress",
      config.expectedIngress,
      readCloudRunMetadataAnnotation(value, "run.googleapis.com/ingress"),
    ),
    ...formatExpectedActualStringError(
      config.serviceName,
      "ingress-status",
      config.expectedIngress,
      readCloudRunMetadataAnnotation(
        value,
        "run.googleapis.com/ingress-status",
      ),
    ),
  ];
}

export function readCloudRunDefaultUrlErrors(
  value: unknown,
  config: CloudRunDefaultUrlAuditConfig,
): string[] {
  const annotationValue = readCloudRunMetadataAnnotation(
    value,
    "run.googleapis.com/default-url-disabled",
  );
  const actualDisabled = annotationValue === "true";
  return actualDisabled === config.expectedDisabled
    ? []
    : [
        `${config.serviceName} default run.app URL disabled must be ${String(config.expectedDisabled)}, got ${annotationValue ?? "missing"}`,
      ];
}

export function readCloudRunJobExecutionConfigErrors(
  value: unknown,
  config: { resourceName: string },
): string[] {
  const taskCount = readIntegerAtPaths(value, [
    ["spec", "template", "spec", "taskCount"],
    ["template", "taskCount"],
  ]);
  const parallelism = readIntegerAtPaths(value, [
    ["spec", "template", "spec", "parallelism"],
    ["template", "parallelism"],
  ]);
  const maxRetries = readIntegerAtPaths(value, [
    ["spec", "template", "spec", "template", "spec", "maxRetries"],
    ["template", "template", "maxRetries"],
  ]);
  const timeoutSeconds = readDurationSecondsAtPaths(value, [
    ["spec", "template", "spec", "template", "spec", "timeoutSeconds"],
    ["template", "template", "timeout"],
  ]);
  const memoryLimit = readCloudRunContainerResourceLimit(value, "memory");
  const cpuLimit = readCloudRunContainerResourceLimit(value, "cpu");

  return [
    ...formatExpectedActualNumberError(
      config.resourceName,
      "taskCount",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_TASK_COUNT,
      taskCount,
    ),
    ...formatExpectedActualNumberError(
      config.resourceName,
      "parallelism",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_PARALLELISM,
      parallelism,
    ),
    ...formatExpectedActualNumberError(
      config.resourceName,
      "maxRetries",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_MAX_RETRIES,
      maxRetries,
    ),
    ...formatExpectedActualNumberError(
      config.resourceName,
      "timeoutSeconds",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_TIMEOUT_SECONDS,
      timeoutSeconds,
    ),
    ...formatExpectedActualStringError(
      config.resourceName,
      "memory limit",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_MEMORY_LIMIT,
      memoryLimit,
    ),
    ...formatExpectedActualStringError(
      config.resourceName,
      "cpu limit",
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_CPU_LIMIT,
      cpuLimit,
    ),
  ];
}

function readCloudRunServiceAccountName(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const serviceAccountPaths = [
    ["spec", "template", "spec", "serviceAccountName"],
    ["spec", "template", "spec", "template", "spec", "serviceAccountName"],
    ["template", "serviceAccount"],
    ["template", "template", "serviceAccount"],
  ] as const;

  for (const path of serviceAccountPaths) {
    let current: unknown = value;
    for (const segment of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[segment];
    }
    if (typeof current === "string" && current.length > 0) {
      return current;
    }
  }

  return null;
}

export function readCloudRunServiceIdentityErrors(
  value: unknown,
  config: CloudRunServiceIdentityAuditConfig,
): string[] {
  const serviceAccountName = readCloudRunServiceAccountName(value);
  if (!serviceAccountName) {
    return [`${config.resourceName} serviceAccountName is missing`];
  }
  if (serviceAccountName !== config.expectedServiceAccount) {
    return [
      `${config.resourceName} serviceAccountName must be ${config.expectedServiceAccount}, got ${serviceAccountName}`,
    ];
  }
  return [];
}

export function readSecretManagerVersionStateErrors(
  value: unknown,
  expectedRef: CloudRunSecretEnvRef,
): string[] {
  if (!isRecord(value)) {
    return [
      `${expectedRef.name} Secret Manager version ${expectedRef.version} metadata is missing`,
    ];
  }

  const errors: string[] = [];
  const expectedNameSuffix = `/secrets/${expectedRef.name}/versions/${expectedRef.version}`;
  const resourceName = value["name"];
  if (
    typeof resourceName !== "string" ||
    !resourceName.endsWith(expectedNameSuffix)
  ) {
    errors.push(
      `${expectedRef.name} Secret Manager version resource must end with ${expectedNameSuffix}`,
    );
  }

  const state = value["state"];
  if (state !== "ENABLED") {
    errors.push(
      `${expectedRef.name} Secret Manager version ${expectedRef.version} must be ENABLED, got ${String(state ?? "missing")}`,
    );
  }

  return errors;
}

function readCloudRunRevisionName(record: Record<string, unknown>): string {
  const metadata = record["metadata"];
  if (!isRecord(metadata)) return "unknown-revision";
  const name = metadata["name"];
  return typeof name === "string" && name.length > 0
    ? name
    : "unknown-revision";
}

function readCloudRunRevisionReadyCondition(
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  const status = record["status"];
  if (!isRecord(status)) return null;
  const conditions = status["conditions"];
  if (!Array.isArray(conditions)) return null;
  return (
    conditions.filter(isRecord).find((condition) => {
      return condition["type"] === "Ready";
    }) ?? null
  );
}

export function readCloudRunRevisionHealthErrors(
  value: unknown,
  serviceName: string,
): string[] {
  return readRecords(value).flatMap((record) => {
    const revisionName = readCloudRunRevisionName(record);
    const readyCondition = readCloudRunRevisionReadyCondition(record);
    if (!readyCondition) {
      return [`${serviceName} ${revisionName} Ready condition is missing`];
    }

    const status = readyCondition["status"];
    if (status === "True") return [];

    const reason = readyCondition["reason"];
    const formattedReason =
      typeof reason === "string" && reason.length > 0 ? ` (${reason})` : "";
    return [
      `${serviceName} ${revisionName} Ready status must be True, got ${String(status ?? "missing")}${formattedReason}`,
    ];
  });
}

export function readUnhealthyCloudRunRevisionNames(value: unknown): string[] {
  return readRecords(value).flatMap((record) => {
    const revisionName = readCloudRunRevisionName(record);
    if (revisionName === "unknown-revision") return [];

    const readyCondition = readCloudRunRevisionReadyCondition(record);
    if (!readyCondition) return [revisionName];
    return readyCondition["status"] === "True" ? [] : [revisionName];
  });
}

function readCloudSchedulerJobDisplayName(
  record: Record<string, unknown>,
): string {
  const name = record["name"];
  if (typeof name === "string" && name.length > 0) {
    return name.split("/").at(-1) ?? name;
  }
  return "unknown-job";
}

export function readCloudSchedulerOidcJobErrors(
  value: unknown,
  config: CloudSchedulerOidcAuditConfig,
): string[] {
  const cronUriPrefix = `${config.publicDomain}/api/cron/`;
  const expectedJobIds =
    config.expectedJobIds ?? REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS;
  const expectedJobIdSet = new Set(expectedJobIds);
  const records = readRecords(value);
  const jobsByName = new Map(
    records.map((record) => [readCloudSchedulerJobDisplayName(record), record]),
  );

  const missingJobErrors = expectedJobIds.flatMap((jobId) => {
    return jobsByName.has(jobId) ? [] : [`${jobId} scheduler job is missing`];
  });

  const jobConfigErrors = records.flatMap((record) => {
    const httpTarget = record["httpTarget"];
    const jobName = readCloudSchedulerJobDisplayName(record);
    const isExpectedJob = expectedJobIdSet.has(jobName);
    if (!isRecord(httpTarget)) {
      return isExpectedJob ? [`${jobName} missing httpTarget`] : [];
    }
    const uri = httpTarget["uri"];
    const isPublicCronJob =
      typeof uri === "string" && uri.startsWith(cronUriPrefix);
    if (!isExpectedJob && !isPublicCronJob) {
      return [];
    }

    const errors: string[] = [];
    const expectedUri = `${cronUriPrefix}${jobName}`;
    if (isExpectedJob && uri !== expectedUri) {
      errors.push(`${jobName} uri must be ${expectedUri}`);
    }
    if (!isExpectedJob && isPublicCronJob) {
      errors.push(`${jobName} is not an expected Cloud Scheduler cron job`);
    }
    const oidcToken = httpTarget["oidcToken"];
    const headers = httpTarget["headers"];

    if (!isRecord(oidcToken)) {
      errors.push(`${jobName} missing httpTarget.oidcToken`);
    } else {
      const serviceAccountEmail = oidcToken["serviceAccountEmail"];
      const audience = oidcToken["audience"];
      if (serviceAccountEmail !== config.schedulerServiceAccount) {
        errors.push(
          `${jobName} oidc serviceAccountEmail must be ${config.schedulerServiceAccount}`,
        );
      }
      if (audience !== config.publicDomain) {
        errors.push(`${jobName} oidc audience must be ${config.publicDomain}`);
      }
    }

    if (isRecord(headers)) {
      const headerNames = Object.keys(headers).map((headerName) => {
        return headerName.toLowerCase();
      });
      if (headerNames.includes("authorization")) {
        errors.push(
          `${jobName} must not set HTTP Authorization header directly`,
        );
      }
      if (headerNames.includes("x-cron-secret")) {
        errors.push(`${jobName} must not set X-Cron-Secret header`);
      }
    }

    return errors;
  });

  return [...missingJobErrors, ...jobConfigErrors];
}

export function readProductionDomainConfigErrors(
  config: ProductionDomainConfig,
): string[] {
  const checks = [
    {
      name: "PUBLIC_DOMAIN",
      value: config.publicDomain,
      expected: EXPECTED_PRODUCTION_DOMAINS.PUBLIC_DOMAIN,
    },
    {
      name: "ADMIN_DOMAIN",
      value: config.adminDomain,
      expected: EXPECTED_PRODUCTION_DOMAINS.ADMIN_DOMAIN,
    },
  ];

  return checks.flatMap((check) => {
    const errors: string[] = [];
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(check.value);
    } catch {
      errors.push(`${check.name} must be a valid URL`);
    }

    if (!check.value.startsWith("https://")) {
      errors.push(`${check.name} must be an https URL`);
    }
    if (check.value.endsWith("/")) {
      errors.push(`${check.name} must not end with a trailing slash`);
    }
    if (
      parsedUrl !== null &&
      (parsedUrl.pathname !== "/" ||
        parsedUrl.search !== "" ||
        parsedUrl.hash !== "" ||
        parsedUrl.username !== "" ||
        parsedUrl.password !== "")
    ) {
      errors.push(
        `${check.name} must be a canonical origin URL without a path, query, or fragment`,
      );
    }
    if (check.value !== check.expected) {
      errors.push(`${check.name} must be ${check.expected}`);
    }
    return errors;
  });
}

export function getProductionHttpAuditTargets(
  config: ProductionDomainConfig,
): ProductionHttpAuditTarget[] {
  return [
    {
      name: "public /api/live returns 200",
      url: `${config.publicDomain}/api/live`,
      expectedStatus: 200,
    },
    {
      name: "public /api/health returns 200",
      url: `${config.publicDomain}/api/health`,
      expectedStatus: 200,
    },
    {
      name: "public /admin is hidden",
      url: `${config.publicDomain}/admin`,
      expectedStatus: 404,
    },
    {
      name: "admin root redirects unauthenticated visitors to Google/IAP",
      url: `${config.adminDomain}/`,
      expectedStatus: 302,
      expectedRedirectHost: "accounts.google.com",
    },
    {
      name: "admin /admin redirects unauthenticated visitors to Google/IAP",
      url: `${config.adminDomain}/admin`,
      expectedStatus: 302,
      expectedRedirectHost: "accounts.google.com",
    },
  ];
}

export function readProductionHttpTargetError(
  target: ProductionHttpAuditTarget,
  response: ProductionHttpAuditResponse,
): string | null {
  if (response.status !== target.expectedStatus) {
    return `expected status ${target.expectedStatus}, got ${response.status}`;
  }

  if (!target.expectedRedirectHost) return null;

  if (!response.redirectUrl) {
    return `expected redirect host ${target.expectedRedirectHost}, got none`;
  }

  let redirectHost: string;
  try {
    redirectHost = new URL(response.redirectUrl).hostname;
  } catch {
    return `expected redirect host ${target.expectedRedirectHost}, got invalid redirect URL`;
  }

  if (redirectHost !== target.expectedRedirectHost) {
    return `expected redirect host ${target.expectedRedirectHost}, got ${redirectHost}`;
  }

  return null;
}

export function getRequiredWifProviderConditionFragments(
  identity: WifProviderConditionIdentity,
): string[] {
  return [
    `assertion.repository == '${identity.repository}'`,
    `assertion.repository_id == '${identity.repositoryId}'`,
    `assertion.repository_owner_id == '${identity.repositoryOwnerId}'`,
    "assertion.ref == 'refs/heads/main'",
    "assertion.event_name == 'push'",
    "assertion.event_name == 'workflow_dispatch'",
    // schedule: terraform-drift.yml (nightly cron) が WIF 経由 terraform-runner
    // 認証に依存。scheduled workflow は default branch (main) で実行される GitHub 仕様
    // のため ref 制限との整合性あり。
    "assertion.event_name == 'schedule'",
  ];
}

export function getExpectedWifProviderCondition(
  identity: WifProviderConditionIdentity,
): string {
  return [
    `assertion.repository == '${identity.repository}'`,
    `assertion.repository_id == '${identity.repositoryId}'`,
    `assertion.repository_owner_id == '${identity.repositoryOwnerId}'`,
    "assertion.ref == 'refs/heads/main'",
    "(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch' || assertion.event_name == 'schedule')",
  ].join(" && ");
}

function normalizeCondition(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function readWifProviderConditionErrors(
  condition: unknown,
  identity: WifProviderConditionIdentity,
): string[] {
  if (typeof condition !== "string") {
    return getRequiredWifProviderConditionFragments(identity);
  }

  const missingFragments = getRequiredWifProviderConditionFragments(
    identity,
  ).filter((fragment) => {
    return !condition.includes(fragment);
  });
  if (missingFragments.length > 0) return missingFragments;

  if (
    normalizeCondition(condition) ===
    normalizeCondition(getExpectedWifProviderCondition(identity))
  ) {
    return [];
  }

  return ["condition must exactly match the expected WIF restriction"];
}
