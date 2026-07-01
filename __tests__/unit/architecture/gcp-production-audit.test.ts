import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  formatNamedResourcesByLocation,
  getCloudBuildConnectionAuditLocations,
  getCloudBuildTriggerAuditLocations,
  getExpectedWifProviderCondition,
  getProductionHttpAuditTargets,
  getRequiredWifProviderConditionFragments,
  readAmbiguousAdminRolePrincipalErrors,
  readBroadProjectIamDeployGrantErrors,
  readBuildServiceAccountProjectIamRoleErrors,
  readIamPolicyMembersForRole,
  readProductionDomainConfigErrors,
  readProductionHttpTargetError,
  readWifProviderConditionErrors,
  readCloudBuildTriggerIdentifiers,
} from "../../../scripts/gcp-production-audit-model";

const auditScript = readFileSync(
  join(process.cwd(), "scripts", "audit-gcp-production-iap.ts"),
  "utf8",
);

describe("GCP production audit model", () => {
  test("audits native Cloud Build triggers in every Cloud Build region and global", () => {
    const locations = getCloudBuildTriggerAuditLocations("asia-northeast1");

    expect(locations[0]).toBe("asia-northeast1");
    expect(locations).toContain("global");
    expect(locations).toContain("us-central1");
    expect(locations).toContain("europe-west1");
    expect(locations).toContain("me-central2");
    expect(locations).toHaveLength(new Set(locations).size);
    expect(locations.length).toBeGreaterThan(30);
  });

  test("does not duplicate global trigger audits when global is the configured region", () => {
    const locations = getCloudBuildTriggerAuditLocations("global");

    expect(locations[0]).toBe("global");
    expect(
      locations.filter((location) => {
        return location === "global";
      }),
    ).toHaveLength(1);
    expect(locations).toContain("asia-northeast1");
    expect(locations).toContain("us-central1");
  });

  test("reads Cloud Build trigger names with id fallback", () => {
    expect(
      readCloudBuildTriggerIdentifiers([
        { name: "deploy-main", id: "ignored-id" },
        { id: "trigger-id-only" },
        { name: 123, id: null },
      ]),
    ).toEqual(["deploy-main", "trigger-id-only"]);
  });

  test("formats named resources with locations so legacy leftovers are actionable", () => {
    expect(
      formatNamedResourcesByLocation([
        { location: "asia-northeast1", names: ["regional-trigger"] },
        { location: "global", names: ["deploy-main"] },
      ]),
    ).toBe("asia-northeast1/regional-trigger,global/deploy-main");
  });

  test("audits Cloud Build repository connections in every Cloud Build region", () => {
    const locations = getCloudBuildConnectionAuditLocations("asia-northeast1");

    expect(locations[0]).toBe("asia-northeast1");
    expect(locations).not.toContain("global");
    expect(locations).toContain("us-central1");
    expect(locations).toContain("europe-west1");
    expect(locations).toContain("me-central2");
    expect(locations).toHaveLength(new Set(locations).size);
    expect(locations.length).toBeGreaterThan(30);
  });

  test("reads IAM policy members for a role", () => {
    expect(
      readIamPolicyMembersForRole(
        {
          bindings: [
            {
              role: "roles/iam.serviceAccountUser",
              members: ["user:admin@example.com", "group:admins@example.com"],
            },
            {
              role: "roles/viewer",
              members: ["user:viewer@example.com"],
            },
          ],
        },
        "roles/iam.serviceAccountUser",
      ),
    ).toEqual(["user:admin@example.com", "group:admins@example.com"]);
  });

  test("reports broad project-level deploy impersonation grants", () => {
    expect(
      readBroadProjectIamDeployGrantErrors({
        bindings: [
          {
            role: "roles/iam.serviceAccountUser",
            members: ["user:admin@example.com"],
          },
          {
            role: "roles/iam.workloadIdentityUser",
            members: ["principalSet://iam.googleapis.com/projects/1/*"],
          },
        ],
      }),
    ).toEqual([
      "roles/iam.serviceAccountUser:user:admin@example.com",
      "roles/iam.workloadIdentityUser:principalSet://iam.googleapis.com/projects/1/*",
    ]);
  });

  test("requires only narrow project-level roles for the build service account", () => {
    expect(
      readBuildServiceAccountProjectIamRoleErrors(
        {
          bindings: [
            {
              role: "roles/cloudbuild.builds.builder",
              members: [
                "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
              ],
            },
            {
              role: "roles/logging.logWriter",
              members: [
                "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
              ],
            },
          ],
        },
        "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
      ),
    ).toEqual([]);

    expect(
      readBuildServiceAccountProjectIamRoleErrors(
        {
          bindings: [
            {
              role: "roles/cloudbuild.builds.builder",
              members: [
                "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
              ],
            },
            {
              role: "roles/run.admin",
              members: [
                "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
              ],
            },
            {
              role: "roles/iap.admin",
              members: [
                "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
              ],
            },
          ],
        },
        "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
      ),
    ).toEqual([
      "roles/logging.logWriter missing for serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
      "roles/iap.admin must not be project-level for serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
      "roles/run.admin must not be project-level for serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
    ]);
  });

  test("reports non-service-account principals assigned to multiple admin role Google Groups", () => {
    expect(
      readAmbiguousAdminRolePrincipalErrors([
        {
          groupEmail: "myrrh-super-admins@myrrh-jp.com",
          memberEmail: "admin@myrrh-jp.com",
          memberType: "USER",
        },
        {
          groupEmail: "myrrh-admins@myrrh-jp.com",
          memberEmail: "ADMIN@myrrh-jp.com",
          memberType: "USER",
        },
        {
          groupEmail: "myrrh-editors@myrrh-jp.com",
          memberEmail:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
          memberType: "SERVICE_ACCOUNT",
        },
        {
          groupEmail: "myrrh-viewers@myrrh-jp.com",
          memberEmail:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
          memberType: "SERVICE_ACCOUNT",
        },
      ]),
    ).toEqual([
      "admin@myrrh-jp.com:myrrh-admins@myrrh-jp.com,myrrh-super-admins@myrrh-jp.com",
    ]);
  });

  test("requires the full GitHub WIF repository identity in provider conditions", () => {
    expect(
      getRequiredWifProviderConditionFragments({
        repository: "y2ikgm89/myrrh-rental-space",
        repositoryId: "1128842422",
        repositoryOwnerId: "69025248",
      }),
    ).toEqual([
      "assertion.repository == 'y2ikgm89/myrrh-rental-space'",
      "assertion.repository_id == '1128842422'",
      "assertion.repository_owner_id == '69025248'",
      "assertion.ref == 'refs/heads/main'",
      "assertion.event_name == 'push'",
      "assertion.event_name == 'workflow_dispatch'",
    ]);
  });

  test("reports GitHub WIF provider condition errors for missing fragments", () => {
    expect(
      readWifProviderConditionErrors(
        "assertion.repository_id == '1128842422'",
        {
          repository: "y2ikgm89/myrrh-rental-space",
          repositoryId: "1128842422",
          repositoryOwnerId: "69025248",
        },
      ),
    ).toEqual([
      "assertion.repository == 'y2ikgm89/myrrh-rental-space'",
      "assertion.repository_owner_id == '69025248'",
      "assertion.ref == 'refs/heads/main'",
      "assertion.event_name == 'push'",
      "assertion.event_name == 'workflow_dispatch'",
    ]);
  });

  test("rejects broadened GitHub WIF provider conditions even when required fragments are present", () => {
    const expectedCondition = getExpectedWifProviderCondition({
      repository: "y2ikgm89/myrrh-rental-space",
      repositoryId: "1128842422",
      repositoryOwnerId: "69025248",
    });

    expect(
      readWifProviderConditionErrors(
        `${expectedCondition} || assertion.repository == 'other-org/other-repo'`,
        {
          repository: "y2ikgm89/myrrh-rental-space",
          repositoryId: "1128842422",
          repositoryOwnerId: "69025248",
        },
      ),
    ).toEqual(["condition must exactly match the expected WIF restriction"]);
  });

  test("requires production domains to be https URLs without trailing slashes", () => {
    expect(
      readProductionDomainConfigErrors({
        publicDomain: "https://rental-space.myrrh-jp.com",
        adminDomain: "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
      }),
    ).toEqual([]);

    expect(
      readProductionDomainConfigErrors({
        publicDomain: "http://rental-space.myrrh-jp.com/",
        adminDomain:
          "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/",
      }),
    ).toEqual([
      "PUBLIC_DOMAIN must be an https URL",
      "PUBLIC_DOMAIN must not end with a trailing slash",
      "PUBLIC_DOMAIN must be https://rental-space.myrrh-jp.com",
      "ADMIN_DOMAIN must not end with a trailing slash",
      "ADMIN_DOMAIN must be https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
    ]);

    expect(
      readProductionDomainConfigErrors({
        publicDomain: "https://rental-space.myrrh-jp.com/admin",
        adminDomain:
          "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app?debug=1",
      }),
    ).toEqual([
      "PUBLIC_DOMAIN must be a canonical origin URL without a path, query, or fragment",
      "PUBLIC_DOMAIN must be https://rental-space.myrrh-jp.com",
      "ADMIN_DOMAIN must be a canonical origin URL without a path, query, or fragment",
      "ADMIN_DOMAIN must be https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
    ]);

    expect(
      readProductionDomainConfigErrors({
        publicDomain: "https://rental-space.myrrh-jp.com.evil.example",
        adminDomain: "https://169.254.169.254",
      }),
    ).toEqual([
      "PUBLIC_DOMAIN must be https://rental-space.myrrh-jp.com",
      "ADMIN_DOMAIN must be https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
    ]);
  });

  test("defines live production HTTP checks for public and admin surfaces", () => {
    expect(
      getProductionHttpAuditTargets({
        publicDomain: "https://rental-space.myrrh-jp.com",
        adminDomain: "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app",
      }),
    ).toEqual([
      {
        name: "public /api/live returns 200",
        url: "https://rental-space.myrrh-jp.com/api/live",
        expectedStatus: 200,
      },
      {
        name: "public /api/health returns 200",
        url: "https://rental-space.myrrh-jp.com/api/health",
        expectedStatus: 200,
      },
      {
        name: "public /admin is hidden",
        url: "https://rental-space.myrrh-jp.com/admin",
        expectedStatus: 404,
      },
      {
        name: "admin /admin redirects unauthenticated visitors to Google/IAP",
        url: "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app/admin",
        expectedStatus: 302,
        expectedRedirectHost: "accounts.google.com",
      },
    ]);
  });

  test("validates live production HTTP check responses", () => {
    const [publicLive, , , adminRedirect] = getProductionHttpAuditTargets({
      publicDomain: "https://rental-space.myrrh-jp.com",
      adminDomain: "https://admin.example.run.app",
    });

    expect(
      readProductionHttpTargetError(publicLive, {
        status: 200,
        redirectUrl: "",
      }),
    ).toBeNull();
    expect(
      readProductionHttpTargetError(publicLive, {
        status: 503,
        redirectUrl: "",
      }),
    ).toBe("expected status 200, got 503");
    expect(
      readProductionHttpTargetError(adminRedirect, {
        status: 302,
        redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      }),
    ).toBeNull();
    expect(
      readProductionHttpTargetError(adminRedirect, {
        status: 302,
        redirectUrl: "https://example.com/login",
      }),
    ).toBe("expected redirect host accounts.google.com, got example.com");
  });

  test("production audit script executes live HTTP checks without logging OAuth redirect URLs", () => {
    expect(auditScript).toContain("getProductionHttpAuditTargets");
    expect(auditScript).toContain("readProductionDomainConfigErrors");
    expect(auditScript).toContain("readProductionHttpTargetError");
    expect(auditScript).toContain('requireEnv("PUBLIC_DOMAIN")');
    expect(auditScript).toContain('requireEnv("ADMIN_DOMAIN")');
    expect(auditScript).toContain('redirect: "manual"');
    expect(auditScript).toContain("readRedirectHost");
    expect(auditScript).toContain("redirectHost=");
    expect(auditScript).not.toContain("redirectUrl=");
  });

  test("production audit script checks build service account project-level role scope", () => {
    expect(auditScript).toContain(
      "readBuildServiceAccountProjectIamRoleErrors",
    );
    expect(auditScript).toContain(
      "build service account project-level roles are limited to Cloud Build execution",
    );
  });

  test("production audit script checks runtime service account role group ownership", () => {
    expect(auditScript).toContain("RUNTIME_SERVICE_ACCOUNT");
    expect(auditScript).toContain(
      "runtime service account owns role Google Group",
    );
    expect(auditScript).toContain("--view=full");
    expect(auditScript).toContain(
      "--format=json(preferredMemberKey.id,type,roles)",
    );
    expect(auditScript).not.toContain(
      "--format=json(preferredMemberKey.id,roles.name)",
    );
    expect(auditScript).toContain(
      "non-service-account principals are assigned to at most one admin role Google Group",
    );
  });

  test("production audit script audits Cloud Build locations concurrently", () => {
    expect(auditScript).toContain("execFileAsync");
    expect(auditScript).toContain("async function tryRunGcloudJsonAsync");
    expect(auditScript).toContain("async function auditCloudBuildTriggers");
    expect(auditScript).toContain("async function auditCloudBuildConnections");
    expect(auditScript).toMatch(
      /Promise\.all\(\s*getCloudBuildTriggerAuditLocations\(region\)\.map/s,
    );
    expect(auditScript).toMatch(
      /Promise\.all\(\s*getCloudBuildConnectionAuditLocations\(region\)\.map/s,
    );
  });
});
