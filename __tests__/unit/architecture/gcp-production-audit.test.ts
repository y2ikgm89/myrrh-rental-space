import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

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
  getExpectedWifProviderCondition,
  getProductionHttpAuditTargets,
  getRequiredWifProviderConditionFragments,
  readAmbiguousAdminRolePrincipalErrors,
  readCloudSchedulerOidcJobErrors,
  readBroadProjectIamDeployGrantErrors,
  readBuildServiceAccountProjectIamRoleErrors,
  readCloudRunRevisionHealthErrors,
  readUnhealthyCloudRunRevisionNames,
  readCloudRunContainerCommandErrors,
  readCloudRunIngressErrors,
  readCloudRunJobExecutionConfigErrors,
  readCloudRunRuntimeEnvErrors,
  readCloudRunServiceIdentityErrors,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_CPU_LIMIT,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_MAX_RETRIES,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_MEMORY_LIMIT,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_PARALLELISM,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_TASK_COUNT,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_TIMEOUT_SECONDS,
  REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
  getExpectedSecretManagerSecretAccessorMembers,
  readIamPolicyMembersForRole,
  readIamRoleMembershipErrors,
  readProjectSecretManagerAccessorErrors,
  readProductionDomainConfigErrors,
  readProductionHttpTargetError,
  readSecretManagerSecretAccessorPolicyErrors,
  readUnexpectedSecretManagerSecretAccessorMembers,
  readSecretManagerVersionStateErrors,
  readWifProviderConditionErrors,
  readCloudBuildTriggerIdentifiers,
} from "../../../scripts/gcp-production-audit-model";

const auditScript = readFileSync(
  join(process.cwd(), "scripts", "audit-gcp-production-iap.ts"),
  "utf8",
);
const auditModel = readFileSync(
  join(process.cwd(), "scripts", "gcp-production-audit-model.ts"),
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

  test("formats exact deletion commands for legacy Cloud Build triggers", () => {
    expect(
      formatCloudBuildTriggerDeletionCommands("myrrh-rental-space", [
        { location: "asia-northeast1", names: ["regional-trigger"] },
        { location: "global", names: ["deploy-main"] },
      ]),
    ).toEqual([
      [
        'gcloud builds triggers delete "regional-trigger"',
        '  --project="myrrh-rental-space"',
        '  --region="asia-northeast1"',
        "  --quiet",
      ].join(" \\\n"),
      [
        'gcloud builds triggers delete "deploy-main"',
        '  --project="myrrh-rental-space"',
        '  --region="global"',
        "  --quiet",
      ].join(" \\\n"),
    ]);
  });

  test("formats exact deletion commands for legacy Cloud Build connections", () => {
    expect(
      formatCloudBuildConnectionDeletionCommands("myrrh-rental-space", [
        { location: "asia-northeast1", names: ["github-myrrh"] },
      ]),
    ).toEqual([
      [
        'gcloud builds connections delete "github-myrrh"',
        '  --project="myrrh-rental-space"',
        '  --region="asia-northeast1"',
        "  --quiet",
      ].join(" \\\n"),
    ]);
  });

  test("formats exact deletion commands for failed Cloud Run revisions", () => {
    expect(
      formatCloudRunRevisionDeletionCommands(
        "myrrh-rental-space",
        "asia-northeast1",
        ["myrrh-rental-space-00236-tk2"],
      ),
    ).toEqual([
      [
        'gcloud run revisions delete "myrrh-rental-space-00236-tk2"',
        '  --project="myrrh-rental-space"',
        '  --region="asia-northeast1"',
        "  --quiet",
      ].join(" \\\n"),
    ]);
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
            role: "roles/iam.serviceAccountTokenCreator",
            members: ["user:token@example.com"],
          },
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
      "roles/iam.serviceAccountTokenCreator:user:token@example.com",
      "roles/iam.serviceAccountUser:user:admin@example.com",
      "roles/iam.workloadIdentityUser:principalSet://iam.googleapis.com/projects/1/*",
    ]);
  });

  test("requires exact resource-level IAM membership for deployment roles", () => {
    const buildMember =
      "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com";
    const runtimeMember =
      "serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com";
    const defaultCloudBuildMember =
      "serviceAccount:626108938746@cloudbuild.gserviceaccount.com";

    expect(
      readIamRoleMembershipErrors(
        {
          bindings: [
            {
              role: "roles/run.admin",
              members: [buildMember],
            },
          ],
        },
        {
          resourceName: "Cloud Run service myrrh-rental-space",
          role: "roles/run.admin",
          expectedMembers: [buildMember],
        },
      ),
    ).toEqual([]);

    expect(
      readIamRoleMembershipErrors(
        {
          bindings: [
            {
              role: "roles/run.admin",
              members: [buildMember, defaultCloudBuildMember],
            },
            {
              role: "roles/run.admin",
              members: [runtimeMember],
              condition: {
                title: "temporary",
                expression: "request.time < timestamp('2026-07-03T00:00:00Z')",
              },
            },
          ],
        },
        {
          resourceName: "Cloud Run service myrrh-rental-space",
          role: "roles/run.admin",
          expectedMembers: [buildMember],
        },
      ),
    ).toEqual([
      "Cloud Run service myrrh-rental-space roles/run.admin unexpected serviceAccount:626108938746@cloudbuild.gserviceaccount.com",
      "Cloud Run service myrrh-rental-space roles/run.admin unexpected serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
      "Cloud Run service myrrh-rental-space roles/run.admin must not use IAM Conditions",
    ]);

    expect(
      readIamRoleMembershipErrors(
        {
          bindings: [
            {
              role: "roles/run.admin",
              members: [runtimeMember],
            },
          ],
        },
        {
          resourceName: "Cloud Run service myrrh-rental-space",
          role: "roles/run.admin",
          expectedMembers: [buildMember],
        },
      ),
    ).toEqual([
      "Cloud Run service myrrh-rental-space roles/run.admin missing serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
      "Cloud Run service myrrh-rental-space roles/run.admin unexpected serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
    ]);
  });

  test("requires runtime service account tokenCreator grants to stay absent", () => {
    expect(
      readIamRoleMembershipErrors(
        { bindings: [] },
        {
          resourceName:
            "runtime service account myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
          role: "roles/iam.serviceAccountTokenCreator",
          expectedMembers: [],
        },
      ),
    ).toEqual([]);

    expect(
      readIamRoleMembershipErrors(
        {
          bindings: [
            {
              role: "roles/iam.serviceAccountTokenCreator",
              members: [
                "serviceAccount:service-626108938746@gcp-sa-cloudbuild.iam.gserviceaccount.com",
              ],
            },
          ],
        },
        {
          resourceName:
            "runtime service account myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
          role: "roles/iam.serviceAccountTokenCreator",
          expectedMembers: [],
        },
      ),
    ).toEqual([
      "runtime service account myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com roles/iam.serviceAccountTokenCreator unexpected serviceAccount:service-626108938746@gcp-sa-cloudbuild.iam.gserviceaccount.com",
    ]);
  });

  test("formats exact removal commands for unexpected resource-level IAM bindings", () => {
    expect(
      formatIamPolicyBindingRemovalCommands({
        baseCommand:
          'gcloud run services remove-iam-policy-binding "myrrh-rental-space"',
        role: "roles/run.admin",
        members: [
          "serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
        ],
        additionalArgs: [
          '  --project="myrrh-rental-space"',
          '  --region="asia-northeast1"',
        ],
      }),
    ).toEqual([
      [
        'gcloud run services remove-iam-policy-binding "myrrh-rental-space"',
        '  --project="myrrh-rental-space"',
        '  --region="asia-northeast1"',
        '  --member="serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com"',
        '  --role="roles/run.admin"',
        "  --condition=None",
      ].join(" \\\n"),
    ]);
  });

  test("formats exact removal commands for unexpected build service account actAs members", () => {
    expect(
      formatBuildServiceAccountActAsRemovalCommands(
        "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
        "myrrh-rental-space",
        [
          "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com",
          "user:operator@example.com",
        ],
      ),
    ).toEqual([
      [
        'gcloud iam service-accounts remove-iam-policy-binding "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com"',
        '  --project="myrrh-rental-space"',
        '  --member="user:operator@example.com"',
        '  --role="roles/iam.serviceAccountUser"',
        "  --condition=None",
      ].join(" \\\n"),
    ]);
  });

  test("formats runtime service account group owner repair commands", () => {
    expect(
      formatRuntimeGroupOwnerRepairCommands(
        "myrrh-super-admins@myrrh-jp.com",
        "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
      ),
    ).toEqual([
      [
        "gcloud identity groups memberships add",
        '  --group-email="myrrh-super-admins@myrrh-jp.com"',
        '  --member-email="myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com"',
        "  --quiet || true",
      ].join(" \\\n"),
      [
        "gcloud identity groups memberships modify-membership-roles",
        '  --group-email="myrrh-super-admins@myrrh-jp.com"',
        '  --member-email="myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com"',
        "  --add-roles=OWNER",
        "  --quiet || true",
      ].join(" \\\n"),
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

  test("requires Cloud Scheduler cron jobs to use OIDC instead of legacy secret headers", () => {
    expect(
      readCloudSchedulerOidcJobErrors(
        [
          {
            name: "projects/myrrh-rental-space/locations/asia-northeast1/jobs/reservation-reminder",
            httpTarget: {
              uri: "https://rental-space.myrrh-jp.com/api/cron/reservation-reminder",
              oidcToken: {
                serviceAccountEmail:
                  "myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com",
                audience: "https://rental-space.myrrh-jp.com",
              },
              headers: {},
            },
          },
        ],
        {
          publicDomain: "https://rental-space.myrrh-jp.com",
          schedulerServiceAccount:
            "myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com",
          expectedJobIds: ["reservation-reminder"],
        },
      ),
    ).toEqual([]);

    expect(
      readCloudSchedulerOidcJobErrors(
        [
          {
            name: "projects/myrrh-rental-space/locations/asia-northeast1/jobs/reservation-reminder",
            httpTarget: {
              uri: "https://rental-space.myrrh-jp.com/api/cron/reservation-reminder",
              headers: {
                Authorization: "Bearer old-secret",
              },
            },
          },
          {
            name: "projects/myrrh-rental-space/locations/asia-northeast1/jobs/instagram-sync",
            httpTarget: {
              uri: "https://rental-space.myrrh-jp.com/api/cron/instagram-sync",
              oidcToken: {
                serviceAccountEmail:
                  "other@myrrh-rental-space.iam.gserviceaccount.com",
                audience: "https://wrong.example.com",
              },
            },
          },
          {
            name: "projects/myrrh-rental-space/locations/asia-northeast1/jobs/not-cron",
            httpTarget: {
              uri: "https://example.com/not-cron",
              headers: {
                Authorization: "Bearer external",
              },
            },
          },
        ],
        {
          publicDomain: "https://rental-space.myrrh-jp.com",
          schedulerServiceAccount:
            "myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com",
          expectedJobIds: [
            "reservation-reminder",
            "instagram-sync",
            "calendar-sync",
          ],
        },
      ),
    ).toEqual([
      "calendar-sync scheduler job is missing",
      "reservation-reminder missing httpTarget.oidcToken",
      "reservation-reminder must not set HTTP Authorization header directly",
      "instagram-sync oidc serviceAccountEmail must be myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com",
      "instagram-sync oidc audience must be https://rental-space.myrrh-jp.com",
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

  test("requires Cloud Run services to expose canonical runtime env values", () => {
    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    env: [
                      { name: "APP_SURFACE", value: "public" },
                      {
                        name: "BETTER_AUTH_URL",
                        value: "https://rental-space.myrrh-jp.com",
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedEnv: {
            APP_SURFACE: "public",
            BETTER_AUTH_URL: "https://rental-space.myrrh-jp.com",
          },
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    env: [
                      { name: "APP_SURFACE", value: "admin" },
                      { name: "BETTER_AUTH_URL", value: "https://old.example" },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedEnv: {
            APP_SURFACE: "public",
            BETTER_AUTH_URL: "https://rental-space.myrrh-jp.com",
            CRON_OIDC_AUDIENCE: "https://rental-space.myrrh-jp.com",
          },
        },
      ),
    ).toEqual([
      "myrrh-rental-space APP_SURFACE must be public",
      "myrrh-rental-space BETTER_AUTH_URL must be https://rental-space.myrrh-jp.com",
      "myrrh-rental-space CRON_OIDC_AUDIENCE is missing",
    ]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    env: [
                      { name: "APP_SURFACE", value: "public" },
                      {
                        name: "CRON_SECRET",
                        valueFrom: {
                          secretKeyRef: {
                            name: "CRON_SECRET",
                            key: "1",
                          },
                        },
                      },
                      {
                        name: "INITIAL_ADMIN_EMAIL",
                        value: "legacy@example.com",
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedEnv: {
            APP_SURFACE: "public",
          },
          forbiddenEnvNames: ["CRON_SECRET", "INITIAL_ADMIN_EMAIL"],
        },
      ),
    ).toEqual([
      "myrrh-rental-space CRON_SECRET must be removed",
      "myrrh-rental-space INITIAL_ADMIN_EMAIL must be removed",
    ]);
  });

  test("requires Cloud Run services to use explicit all ingress for direct public and IAP URLs", () => {
    expect(
      readCloudRunIngressErrors(
        {
          metadata: {
            annotations: {
              "run.googleapis.com/ingress": "all",
              "run.googleapis.com/ingress-status": "all",
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedIngress: "all",
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunIngressErrors(
        {
          metadata: {
            annotations: {
              "run.googleapis.com/ingress": "internal-and-cloud-load-balancing",
              "run.googleapis.com/ingress-status":
                "internal-and-cloud-load-balancing",
            },
          },
        },
        {
          serviceName: "myrrh-rental-space-admin",
          expectedIngress: "all",
        },
      ),
    ).toEqual([
      "myrrh-rental-space-admin ingress must be all, got internal-and-cloud-load-balancing",
      "myrrh-rental-space-admin ingress-status must be all, got internal-and-cloud-load-balancing",
    ]);

    expect(
      readCloudRunIngressErrors(
        {},
        {
          serviceName: "myrrh-rental-space",
          expectedIngress: "all",
        },
      ),
    ).toEqual([
      "myrrh-rental-space ingress must be all, got missing",
      "myrrh-rental-space ingress-status must be all, got missing",
    ]);
  });

  test("requires Cloud Run services and jobs to use the dedicated runtime service account", () => {
    expect(
      readCloudRunServiceIdentityErrors(
        {
          spec: {
            template: {
              spec: {
                serviceAccountName:
                  "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
              },
            },
          },
        },
        {
          resourceName: "myrrh-rental-space",
          expectedServiceAccount:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunServiceIdentityErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    serviceAccountName:
                      "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
                  },
                },
              },
            },
          },
        },
        {
          resourceName: "prisma-migrate",
          expectedServiceAccount:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunServiceIdentityErrors(
        {
          spec: {
            template: {
              spec: {
                serviceAccountName:
                  "626108938746-compute@developer.gserviceaccount.com",
              },
            },
          },
        },
        {
          resourceName: "myrrh-rental-space",
          expectedServiceAccount:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
        },
      ),
    ).toEqual([
      "myrrh-rental-space serviceAccountName must be myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com, got 626108938746-compute@developer.gserviceaccount.com",
    ]);

    expect(
      readCloudRunServiceIdentityErrors(
        {},
        {
          resourceName: "prisma-migrate",
          expectedServiceAccount:
            "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com",
        },
      ),
    ).toEqual(["prisma-migrate serviceAccountName is missing"]);
  });

  test("requires Cloud Run services to bind every production secret env var to the pinned version", () => {
    expect(REQUIRED_CLOUD_RUN_SECRET_ENV_REFS).toEqual([
      { name: "DATABASE_URL", version: "1" },
      { name: "BETTER_AUTH_SECRET", version: "1" },
      { name: "ENCRYPTION_KEY", version: "1" },
      { name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", version: "1" },
      { name: "R2_ACCOUNT_ID", version: "1" },
      { name: "R2_ACCESS_KEY_ID", version: "1" },
      { name: "R2_SECRET_ACCESS_KEY", version: "1" },
      { name: "R2_BUCKET_NAME", version: "1" },
      { name: "R2_PUBLIC_URL", version: "1" },
      { name: "CLOUDFLARE_ZONE_ID", version: "1" },
      { name: "CLOUDFLARE_API_TOKEN", version: "1" },
      { name: "GOOGLE_CLIENT_ID", version: "1" },
      { name: "GOOGLE_CLIENT_SECRET", version: "1" },
    ]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    env: REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.map((ref) => {
                      return {
                        name: ref.name,
                        valueSource: {
                          secretKeyRef: {
                            secret: ref.name,
                            version: ref.version,
                          },
                        },
                      };
                    }),
                  },
                ],
              },
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedEnv: {},
          requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                containers: [
                  {
                    env: [
                      {
                        name: "DATABASE_URL",
                        valueFrom: {
                          secretKeyRef: {
                            name: "DATABASE_URL",
                            key: "latest",
                          },
                        },
                      },
                      { name: "BETTER_AUTH_SECRET", value: "not-a-secret-ref" },
                      {
                        name: "ENCRYPTION_KEY",
                        valueSource: {
                          secretKeyRef: {
                            secret: "LEGACY_ENCRYPTION_KEY",
                            version: "1",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        {
          serviceName: "myrrh-rental-space",
          expectedEnv: {},
          requiredSecretEnvRefs: [
            { name: "DATABASE_URL", version: "1" },
            { name: "BETTER_AUTH_SECRET", version: "1" },
            { name: "ENCRYPTION_KEY", version: "1" },
            { name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", version: "1" },
          ],
        },
      ),
    ).toEqual([
      "myrrh-rental-space DATABASE_URL must reference Secret Manager version 1",
      "myrrh-rental-space BETTER_AUTH_SECRET must be bound from Secret Manager",
      "myrrh-rental-space ENCRYPTION_KEY must reference Secret Manager secret ENCRYPTION_KEY",
      "myrrh-rental-space NEXT_SERVER_ACTIONS_ENCRYPTION_KEY secret binding is missing",
    ]);
  });

  test("requires Cloud Run migrate Job to bind DATABASE_URL to the pinned secret version", () => {
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS).toEqual([
      { name: "DATABASE_URL", version: "1" },
    ]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        env: [
                          {
                            name: "DATABASE_URL",
                            valueFrom: {
                              secretKeyRef: {
                                name: "DATABASE_URL",
                                key: "1",
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          serviceName: "prisma-migrate",
          expectedEnv: {},
          requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        env: [
                          {
                            name: "DATABASE_URL",
                            valueFrom: {
                              secretKeyRef: {
                                name: "DATABASE_URL",
                                key: "latest",
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          serviceName: "prisma-migrate",
          expectedEnv: {},
          requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
        },
      ),
    ).toEqual([
      "prisma-migrate DATABASE_URL must reference Secret Manager version 1",
    ]);

    expect(
      readCloudRunRuntimeEnvErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        env: [
                          {
                            name: "DATABASE_URL",
                            value: "not-a-secret-ref",
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          serviceName: "prisma-migrate",
          expectedEnv: {},
          requiredSecretEnvRefs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
        },
      ),
    ).toEqual([
      "prisma-migrate DATABASE_URL must be bound from Secret Manager",
    ]);
  });

  test("requires Cloud Run migrate Job to run the canonical Prisma deploy command", () => {
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND).toEqual(["bunx"]);
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS).toEqual([
      "--bun",
      "prisma",
      "migrate",
      "deploy",
    ]);

    expect(
      readCloudRunContainerCommandErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        command: REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
                        args: REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          resourceName: "prisma-migrate",
          expectedCommand: REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
          expectedArgs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
        },
      ),
    ).toEqual([]);

    expect(
      readCloudRunContainerCommandErrors(
        {
          spec: {
            template: {
              spec: {
                template: {
                  spec: {
                    containers: [
                      {
                        command: ["node"],
                        args: ["scripts/unsafe.js"],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          resourceName: "prisma-migrate",
          expectedCommand: REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
          expectedArgs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
        },
      ),
    ).toEqual([
      'prisma-migrate command must be ["bunx"], got ["node"]',
      'prisma-migrate args must be ["--bun","prisma","migrate","deploy"], got ["scripts/unsafe.js"]',
    ]);

    expect(
      readCloudRunContainerCommandErrors(
        {},
        {
          resourceName: "prisma-migrate",
          expectedCommand: REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND,
          expectedArgs: REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS,
        },
      ),
    ).toEqual(["prisma-migrate container is missing"]);
  });

  test("requires Cloud Run migrate Job execution settings to stay single-task and bounded", () => {
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_TASK_COUNT).toBe(1);
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_PARALLELISM).toBe(1);
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_MAX_RETRIES).toBe(0);
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_TIMEOUT_SECONDS).toBe(600);
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_MEMORY_LIMIT).toBe("1Gi");
    expect(REQUIRED_CLOUD_RUN_MIGRATE_JOB_CPU_LIMIT).toBe("1");

    expect(
      readCloudRunJobExecutionConfigErrors(
        {
          spec: {
            template: {
              spec: {
                taskCount: 1,
                parallelism: 1,
                template: {
                  spec: {
                    maxRetries: 0,
                    timeoutSeconds: "600",
                    containers: [
                      {
                        resources: {
                          limits: {
                            memory: "1Gi",
                            cpu: "1",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        { resourceName: "prisma-migrate" },
      ),
    ).toEqual([]);

    expect(
      readCloudRunJobExecutionConfigErrors(
        {
          spec: {
            template: {
              spec: {
                taskCount: 2,
                parallelism: 2,
                template: {
                  spec: {
                    maxRetries: 3,
                    timeoutSeconds: "60",
                    containers: [
                      {
                        resources: {
                          limits: {
                            memory: "512Mi",
                            cpu: "2000m",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        { resourceName: "prisma-migrate" },
      ),
    ).toEqual([
      "prisma-migrate taskCount must be 1, got 2",
      "prisma-migrate parallelism must be 1, got 2",
      "prisma-migrate maxRetries must be 0, got 3",
      "prisma-migrate timeoutSeconds must be 600, got 60",
      "prisma-migrate memory limit must be 1Gi, got 512Mi",
      "prisma-migrate cpu limit must be 1, got 2000m",
    ]);
  });

  test("requires every pinned Secret Manager version to be enabled", () => {
    expect(
      readSecretManagerVersionStateErrors(
        {
          name: "projects/myrrh-rental-space/secrets/DATABASE_URL/versions/1",
          state: "ENABLED",
        },
        { name: "DATABASE_URL", version: "1" },
      ),
    ).toEqual([]);

    expect(
      readSecretManagerVersionStateErrors(
        {
          name: "projects/myrrh-rental-space/secrets/DATABASE_URL/versions/latest",
          state: "DISABLED",
        },
        { name: "DATABASE_URL", version: "1" },
      ),
    ).toEqual([
      "DATABASE_URL Secret Manager version resource must end with /secrets/DATABASE_URL/versions/1",
      "DATABASE_URL Secret Manager version 1 must be ENABLED, got DISABLED",
    ]);

    expect(
      readSecretManagerVersionStateErrors(null, {
        name: "DATABASE_URL",
        version: "1",
      }),
    ).toEqual(["DATABASE_URL Secret Manager version 1 metadata is missing"]);
  });

  test("requires Secret Manager accessor IAM to stay secret-level and least privilege", () => {
    const runtimeMember =
      "serviceAccount:myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com";
    const buildMember =
      "serviceAccount:myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com";
    const defaultBuildMember =
      "serviceAccount:626108938746@cloudbuild.gserviceaccount.com";

    expect(
      readProjectSecretManagerAccessorErrors({
        bindings: [
          {
            role: "roles/secretmanager.secretAccessor",
            members: [runtimeMember],
          },
          {
            role: "roles/viewer",
            members: [runtimeMember],
          },
        ],
      }),
    ).toEqual([
      `roles/secretmanager.secretAccessor project-level grant must be removed for ${runtimeMember}`,
    ]);

    expect(
      getExpectedSecretManagerSecretAccessorMembers({
        secretName: "DATABASE_URL",
        runtimeServiceAccount: runtimeMember.slice("serviceAccount:".length),
        buildServiceAccount: buildMember.slice("serviceAccount:".length),
      }),
    ).toEqual([runtimeMember]);
    expect(
      getExpectedSecretManagerSecretAccessorMembers({
        secretName: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
        runtimeServiceAccount: runtimeMember.slice("serviceAccount:".length),
        buildServiceAccount: buildMember.slice("serviceAccount:".length),
      }),
    ).toEqual([buildMember, runtimeMember]);

    expect(
      readSecretManagerSecretAccessorPolicyErrors(
        {
          bindings: [
            {
              role: "roles/secretmanager.secretAccessor",
              members: [runtimeMember],
            },
          ],
        },
        {
          secretName: "DATABASE_URL",
          expectedMembers: [runtimeMember],
        },
      ),
    ).toEqual([]);

    expect(
      readSecretManagerSecretAccessorPolicyErrors(
        {
          bindings: [
            {
              role: "roles/secretmanager.secretAccessor",
              members: [defaultBuildMember],
            },
            {
              role: "roles/secretmanager.secretAccessor",
              members: [buildMember],
              condition: {
                title: "temporary-build-access",
                expression: "request.time < timestamp('2026-01-01T00:00:00Z')",
              },
            },
          ],
        },
        {
          secretName: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
          expectedMembers: [buildMember, runtimeMember],
        },
      ),
    ).toEqual([
      `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY roles/secretmanager.secretAccessor missing ${buildMember}`,
      `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY roles/secretmanager.secretAccessor missing ${runtimeMember}`,
      `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY roles/secretmanager.secretAccessor unexpected ${defaultBuildMember}`,
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY roles/secretmanager.secretAccessor must not use IAM Conditions",
    ]);
    expect(
      readUnexpectedSecretManagerSecretAccessorMembers(
        {
          bindings: [
            {
              role: "roles/secretmanager.secretAccessor",
              members: [buildMember, defaultBuildMember],
            },
          ],
        },
        [buildMember, runtimeMember],
      ),
    ).toEqual([defaultBuildMember]);
    expect(
      formatSecretManagerSecretAccessorRemovalCommands(
        "myrrh-rental-space",
        "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
        [defaultBuildMember],
      ),
    ).toEqual([
      [
        'gcloud secrets remove-iam-policy-binding "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"',
        '  --project="myrrh-rental-space"',
        `  --member="${defaultBuildMember}"`,
        '  --role="roles/secretmanager.secretAccessor"',
        "  --condition=None",
      ].join(" \\\n"),
    ]);
  });

  test("requires Cloud Run services to have no failed or pending revisions", () => {
    expect(
      readUnhealthyCloudRunRevisionNames([
        {
          metadata: { name: "myrrh-rental-space-00236-tk2" },
          status: {
            conditions: [
              {
                type: "Ready",
                status: "False",
                reason: "HealthCheckContainerError",
              },
            ],
          },
        },
        {
          metadata: { name: "myrrh-rental-space-00237-2fc" },
          status: {
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
      ]),
    ).toEqual(["myrrh-rental-space-00236-tk2"]);

    expect(
      readCloudRunRevisionHealthErrors(
        [
          {
            metadata: { name: "myrrh-rental-space-00237-2fc" },
            status: {
              conditions: [{ type: "Ready", status: "True" }],
            },
          },
          {
            metadata: { name: "myrrh-rental-space-00235-v2f" },
            status: {
              conditions: [
                { type: "Ready", status: "True", reason: "Retired" },
              ],
            },
          },
        ],
        "myrrh-rental-space",
      ),
    ).toEqual([]);

    expect(
      readCloudRunRevisionHealthErrors(
        [
          {
            metadata: { name: "myrrh-rental-space-00236-tk2" },
            status: {
              conditions: [
                {
                  type: "Ready",
                  status: "False",
                  reason: "HealthCheckContainerError",
                },
              ],
            },
          },
          {
            status: {
              conditions: [{ type: "RoutesReady", status: "True" }],
            },
          },
        ],
        "myrrh-rental-space",
      ),
    ).toEqual([
      "myrrh-rental-space myrrh-rental-space-00236-tk2 Ready status must be True, got False (HealthCheckContainerError)",
      "myrrh-rental-space unknown-revision Ready condition is missing",
    ]);
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

  test("production audit supports an explicit gcloud executable path", () => {
    expect(auditScript).toContain('process.env["GCLOUD_BIN"]');
    expect(auditScript).toContain("configuredGcloudBin");
    expect(auditScript).toContain("gcloudBin");
  });

  test("production audit preflights non-interactive gcloud authentication without logging tokens", () => {
    expect(auditScript).toContain("assertGcloudNonInteractiveAuth");
    expect(auditScript).toContain('"auth", "print-access-token"');
    expect(auditScript).toContain("gcloud authentication is refreshable");
    expect(auditScript).toContain("Run `gcloud auth login`");
    expect(auditScript).not.toContain("accessToken=");
  });

  test("production audit script checks build service account project-level role scope", () => {
    expect(auditScript).toContain(
      "readBuildServiceAccountProjectIamRoleErrors",
    );
    expect(auditScript).toContain(
      "build service account project-level roles are limited to Cloud Build execution",
    );
    expect(auditScript).toContain(
      "formatBuildServiceAccountActAsRemovalCommands",
    );
  });

  test("production audit script checks resource-level deploy IAM grants", () => {
    expect(auditScript).toContain("readIamRoleMembershipErrors");
    expect(auditScript).toContain("formatIamPolicyBindingRemovalCommands");
    expect(auditScript).toContain(
      "Artifact Registry repository writer is limited to build service account",
    );
    expect(auditScript).toContain(
      "Cloud Run deploy admin grants are limited to build service account",
    );
    expect(auditScript).toContain(
      "runtime service account actAs grant is limited to build service account",
    );
    expect(auditScript).toContain(
      "runtime service account tokenCreator grants are absent",
    );
    expect(auditScript).toContain(
      "Cloud Build source bucket objectViewer is limited to build service account",
    );
    expect(auditScript).toContain('"artifacts",');
    expect(auditScript).toContain('"repositories",');
    expect(auditScript).toContain('"storage",');
    expect(auditScript).toContain('"buckets",');
    expect(auditScript).toContain('"jobs",');
    expect(auditScript).toContain('"get-iam-policy",');
  });

  test("production audit requires explicit production identifiers without loose defaults", () => {
    for (const requiredName of [
      "GCP_PROJECT_ID",
      "REGION",
      "SERVICE_NAME",
      "ADMIN_SERVICE_NAME",
      "MIGRATE_JOB_NAME",
      "AR_REPOSITORY",
      "BUILD_SERVICE_ACCOUNT",
      "RUNTIME_SERVICE_ACCOUNT",
      "CRON_SERVICE_ACCOUNT_EMAIL",
      "WIF_POOL_ID",
      "WIF_PROVIDER_ID",
    ]) {
      expect(auditScript).toContain(`requireEnv("${requiredName}")`);
    }

    expect(auditScript).not.toContain('process.env["PROJECT_ID"]');
    expect(auditScript).not.toContain('process.env["BUILD_SA"]');
    expect(auditScript).not.toContain('process.env["RUNTIME_SA"]');
    expect(auditScript).not.toContain('process.env["SCHEDULER_SA"]');
    expect(auditScript).not.toContain('requireEnv("REGION",');
    expect(auditScript).not.toContain('requireEnv("SERVICE_NAME",');
    expect(auditScript).not.toContain('requireEnv("ADMIN_SERVICE_NAME",');
    expect(auditScript).not.toContain('requireEnv("WIF_POOL_ID",');
    expect(auditScript).not.toContain('requireEnv("WIF_PROVIDER_ID",');
    expect(auditScript).not.toContain("myrrh-rental-space-build@${projectId}");
    expect(auditScript).not.toContain(
      "myrrh-rental-space-runtime@${projectId}",
    );
    expect(auditScript).not.toContain(
      "myrrh-rental-space-scheduler@${projectId}",
    );
  });

  test("production audit rejects whitespace-padded env values and IAM-prefixed group env", () => {
    expect(auditScript).toContain(
      "must not have leading or trailing whitespace",
    );
    expect(auditScript).toContain("value !== value.trim()");
    expect(auditScript).toContain("googleGroupEmailPattern");
    expect(auditScript).toContain("must be a bare Google Group email");
    expect(auditScript).not.toContain('value.startsWith("group:")');
    expect(auditScript).not.toContain('value.slice("group:".length)');
  });

  test("production audit script checks scheduler service account user-managed keys", () => {
    expect(auditScript).toContain(
      "scheduler service account has no user-managed keys",
    );
    expect(auditScript).toContain("schedulerServiceAccountKeys");
    expect(auditScript).toContain('"--managed-by=user"');
  });

  test("production audit script checks canonical Cloud Run runtime env", () => {
    expect(auditScript).toContain("readCloudRunRuntimeEnvErrors");
    expect(auditScript).toContain("readCloudRunServiceIdentityErrors");
    expect(auditScript).toContain("public Cloud Run runtime env is canonical");
    expect(auditScript).toContain("admin Cloud Run runtime env is canonical");
    expect(auditScript).toContain("Cloud Run service ingress is canonical");
    expect(auditScript).toContain("readCloudRunIngressErrors");
    expect(auditScript).toContain("Cloud Run service identities are dedicated");
    expect(auditScript).toContain(
      "Cloud Run migrate Job identity is dedicated",
    );
    expect(auditScript).toContain("Cloud Run migrate Job env is canonical");
    expect(auditScript).toContain("Cloud Run migrate Job command is canonical");
    expect(auditScript).toContain(
      "Cloud Run migrate Job execution config is canonical",
    );
    expect(auditScript).toContain("migrateJobName");
    expect(auditScript).not.toContain('"prisma-migrate",');
    expect(auditScript).toContain("requiredSecretEnvRefs");
    expect(auditScript).toContain("REQUIRED_CLOUD_RUN_SECRET_ENV_REFS");
    expect(auditScript).toContain(
      "REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS",
    );
    expect(auditScript).toContain("REQUIRED_CLOUD_RUN_MIGRATE_JOB_COMMAND");
    expect(auditScript).toContain("REQUIRED_CLOUD_RUN_MIGRATE_JOB_ARGS");
    expect(auditScript).toContain("readSecretManagerVersionStateErrors");
    expect(auditScript).toContain(
      "required Secret Manager versions are enabled",
    );
    expect(auditScript).toContain("readProjectSecretManagerAccessorErrors");
    expect(auditScript).toContain(
      "formatSecretManagerSecretAccessorRemovalCommands",
    );
    expect(auditScript).toContain(
      "project IAM has no broad Secret Manager accessor grants",
    );
    expect(auditScript).toContain(
      "required Secret Manager accessor IAM is least privilege",
    );
    expect(auditScript).toContain('"secrets",');
    expect(auditScript).toContain('"versions",');
    expect(auditScript).toContain('"get-iam-policy",');
    expect(auditScript).toContain('"describe",');
    expect(auditScript).toContain("BETTER_AUTH_URL");
    expect(auditScript).toContain("forbiddenEnvNames");
    expect(auditScript).toContain("INITIAL_ADMIN_EMAIL");
    expect(auditScript).toContain("INITIAL_ADMIN_NAME");
  });

  test("production audit script checks Cloud Run revision health", () => {
    expect(auditScript).toContain("readCloudRunRevisionHealthErrors");
    expect(auditScript).toContain("readUnhealthyCloudRunRevisionNames");
    expect(auditScript).toContain("formatCloudRunRevisionDeletionCommands");
    expect(auditScript).toContain("public Cloud Run revisions are healthy");
    expect(auditScript).toContain("admin Cloud Run revisions are healthy");
    expect(auditScript).toContain("deleteCommands=");
    expect(auditScript).toContain('"run",');
    expect(auditScript).toContain('"revisions",');
    expect(auditScript).toContain('"list",');
    expect(auditScript).toContain("--service");
  });

  test("production audit script checks runtime service account role group ownership", () => {
    expect(auditScript).toContain("RUNTIME_SERVICE_ACCOUNT");
    expect(auditScript).toContain(
      "runtime service account owns role Google Group",
    );
    expect(auditScript).toContain("formatRuntimeGroupOwnerRepairCommands");
    expect(auditScript).toContain("repairCommands=");
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
    expect(auditScript).not.toContain("roles.name");
  });

  test("production audit reads Cloud Run IAP IAM through the official REST resource", () => {
    const combinedSource = `${auditScript}\n${auditModel}`;

    expect(combinedSource).toContain("https://iap.googleapis.com/v1/");
    expect(combinedSource).toContain("iap_web/cloud_run-");
    expect(combinedSource).toContain(":getIamPolicy");
    expect(auditScript).toContain("auth");
    expect(auditScript).toContain("print-access-token");
    expect(auditScript).not.toContain('"--resource-type=cloud-run"');
    expect(auditScript).not.toMatch(
      /"iap",\s*"web",\s*"get-iam-policy"[\s\S]*"--resource-type=cloud-run"/u,
    );
  });

  test("production audit script audits Cloud Build locations concurrently", () => {
    expect(auditScript).toContain("execFileAsync");
    expect(auditScript).toContain("async function tryRunGcloudJsonAsync");
    expect(auditScript).toContain("async function auditCloudBuildTriggers");
    expect(auditScript).toContain("async function auditCloudBuildConnections");
    expect(auditScript).toContain("formatCloudBuildTriggerDeletionCommands");
    expect(auditScript).toContain("formatCloudBuildConnectionDeletionCommands");
    expect(auditScript).toMatch(
      /Promise\.all\(\s*getCloudBuildTriggerAuditLocations\(region\)\.map/s,
    );
    expect(auditScript).toMatch(
      /Promise\.all\(\s*getCloudBuildConnectionAuditLocations\(region\)\.map/s,
    );
  });
});
