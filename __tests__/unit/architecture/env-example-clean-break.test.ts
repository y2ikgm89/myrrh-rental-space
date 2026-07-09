import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
const dockerCompose = readFileSync(
  join(process.cwd(), "docker-compose.yml"),
  "utf8",
);

describe(".env.example clean-break contract", () => {
  test("documents the current production env surface without hidden admin requirements", () => {
    for (const requiredName of [
      "APP_SURFACE",
      "ADMIN_APP_URL",
      "BETTER_AUTH_URL",
      "AUDIT_LOG_HMAC_KEY",
      "CRON_OIDC_AUDIENCE",
      "CRON_SERVICE_ACCOUNT_EMAIL",
      "IAP_JWT_AUDIENCE",
      "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
      "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
      "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    ]) {
      expect(envExample).toContain(`${requiredName}=`);
    }
  });

  test("does not advertise removed production bootstrap or shared-secret env names", () => {
    for (const removedName of [
      "ADMIN_LOGIN_TOKEN",
      "CRON_SECRET",
      "INITIAL_ADMIN_EMAIL",
      "INITIAL_ADMIN_NAME",
    ]) {
      expect(envExample).not.toContain(removedName);
    }
  });

  test("documents an isolated local test database for real-DB integration tests", () => {
    expect(envExample).toContain(
      'TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public"',
    );
    expect(dockerCompose).toContain("test-db:");
    expect(dockerCompose).toContain("POSTGRES_DB: myrrh_test");
    expect(dockerCompose).toContain('"5433:5432"');
  });
});
