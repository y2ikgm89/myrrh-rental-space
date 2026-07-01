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

const EXPECTED_PRODUCTION_DOMAINS = {
  PUBLIC_DOMAIN: "https://rental-space.myrrh-jp.com",
  ADMIN_DOMAIN: "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
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

export function readBroadProjectIamDeployGrantErrors(value: unknown): string[] {
  return ["roles/iam.serviceAccountUser", "roles/iam.workloadIdentityUser"]
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
    "(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')",
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
