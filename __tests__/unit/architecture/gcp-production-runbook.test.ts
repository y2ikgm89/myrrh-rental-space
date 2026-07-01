import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { getExpectedWifProviderCondition } from "../../../scripts/gcp-production-audit-model";

const runbook = readFileSync(
  join(process.cwd(), "docs", "gcp-production-setup.md"),
  "utf8",
);
const adminAccessRunbook = readFileSync(
  join(process.cwd(), "docs", "admin-access.md"),
  "utf8",
);

describe("GCP production setup runbook", () => {
  test("uses concrete production identifiers for non-secret required variables", () => {
    expect(runbook).toContain('export PROJECT_ID="myrrh-rental-space"');
    expect(runbook).toContain('export GCP_ORGANIZATION_ID="844678510879"');
    expect(runbook).toContain('export CLOUD_IDENTITY_DOMAIN="myrrh-jp.com"');
    expect(runbook).toContain(
      'export PUBLIC_DOMAIN="https://rental-space.myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_DOMAIN="https://myrrh-rental-space-admin-da57q4squa-an.a.run.app"',
    );
    expect(runbook).toContain(
      'export TURNSTILE_SITE_KEY="0x4AAAAAADi6Bqavj97fu7JG"',
    );
    expect(runbook).toContain(
      'export GITHUB_REPOSITORY="y2ikgm89/myrrh-rental-space"',
    );
    expect(runbook).toContain('export GITHUB_REPOSITORY_ID="1128842422"');
    expect(runbook).toContain('export GITHUB_REPOSITORY_OWNER_ID="69025248"');
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL="myrrh-super-admins@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_ADMIN_EMAIL="myrrh-admins@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_EDITOR_EMAIL="myrrh-editors@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export ADMIN_ROLE_GROUP_VIEWER_EMAIL="myrrh-viewers@myrrh-jp.com"',
    );
    expect(runbook).toContain(
      'export PRIMARY_ADMIN_EMAIL="admin@myrrh-jp.com"',
    );
    expect(runbook).not.toContain("INITIAL_ADMIN_EMAIL");
    expect(runbook).not.toContain("INITIAL_ADMIN_NAME");
  });

  test("does not keep generic production identifier placeholders", () => {
    expect(runbook).not.toContain("your-gcp-project-id");
    expect(runbook).not.toContain("123456789012");
    expect(runbook).not.toContain("example.com");
    expect(runbook).not.toContain("owner@example.com");
    expect(runbook).not.toContain("myrrh-admins@example.com");
    expect(runbook).not.toContain("https://example.com");
  });

  test("admin access audit command pins the GitHub WIF repository identity", () => {
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY = "y2ikgm89/myrrh-rental-space"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY_ID = "1128842422"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:GITHUB_REPOSITORY_OWNER_ID = "69025248"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:WIF_PROVIDER_ID = "github-myrrh-rental-space"',
    );
    expect(runbook).toContain('GITHUB_REPOSITORY="$GITHUB_REPOSITORY"');
    expect(runbook).toContain('GITHUB_REPOSITORY_ID="$GITHUB_REPOSITORY_ID"');
    expect(runbook).toContain(
      'GITHUB_REPOSITORY_OWNER_ID="$GITHUB_REPOSITORY_OWNER_ID"',
    );
  });

  test("production audit commands include the canonical public and admin domains", () => {
    expect(adminAccessRunbook).toContain(
      '$env:PUBLIC_DOMAIN = "https://rental-space.myrrh-jp.com"',
    );
    expect(adminAccessRunbook).toContain(
      '$env:ADMIN_DOMAIN = "https://myrrh-rental-space-admin-da57q4squa-an.a.run.app"',
    );
    expect(runbook).toContain('PUBLIC_DOMAIN="$PUBLIC_DOMAIN"');
    expect(runbook).toContain('ADMIN_DOMAIN="$ADMIN_DOMAIN"');
    expect(runbook).toContain(
      "production HTTP domains are canonical HTTPS URLs",
    );
    expect(runbook).toContain("The production audit rejects any other host");
    expect(runbook).toContain("lookalike domains");
    expect(runbook).toContain("private IP literals");
    expect(runbook).toContain(
      "admin /admin redirects unauthenticated visitors to Google/IAP",
    );
  });

  test("production verification variable list includes the full WIF identity", () => {
    expect(runbook).toContain(
      "`GCP_ORGANIZATION_ID`, `CLOUD_IDENTITY_DOMAIN`, `GITHUB_REPOSITORY`,",
    );
    expect(runbook).toContain(
      "`GITHUB_REPOSITORY_ID`, `GITHUB_REPOSITORY_OWNER_ID`, `RUNTIME_SA`,",
    );
    expect(runbook).toContain("`BUILD_SA`, `WIF_POOL_ID`");
  });

  test("documents the image-baked Next Server Actions encryption key contract", () => {
    expect(runbook).toContain("openssl rand -base64 32");
    expect(runbook).toContain("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    expect(runbook).toContain("official Next.js self-hosting");
    expect(runbook).toContain("contract: it is a consistent base64-encoded");
    expect(runbook).toContain("records the effective key in the server");
    expect(runbook).toContain("rotate it only with a rebuild + redeploy");
  });

  test("documents that project-level deploy impersonation grants must stay absent", () => {
    expect(runbook).toContain(
      "project-level `roles/iam.serviceAccountUser` grants must remain absent",
    );
    expect(runbook).toContain(
      "project-level `roles/iam.workloadIdentityUser` grants must remain absent",
    );
  });

  test("native Cloud Build cleanup covers every official Cloud Build region", () => {
    expect(runbook).toContain("CLOUD_BUILD_REGIONS=(");
    expect(runbook).toContain("asia-northeast1");
    expect(runbook).toContain("us-central1");
    expect(runbook).toContain("europe-west1");
    expect(runbook).toContain("me-central2");
    expect(runbook).toContain(
      'for location in global "${CLOUD_BUILD_REGIONS[@]}"',
    );
    expect(runbook).toContain('for location in "${CLOUD_BUILD_REGIONS[@]}"');
  });

  test("WIF provider command uses the same expected condition as the production audit", () => {
    const expectedCondition = getExpectedWifProviderCondition({
      repository: "${GITHUB_REPOSITORY}",
      repositoryId: "${GITHUB_REPOSITORY_ID}",
      repositoryOwnerId: "${GITHUB_REPOSITORY_OWNER_ID}",
    });

    expect(runbook).toContain(`--attribute-condition="${expectedCondition}"`);
  });
});
