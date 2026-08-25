import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
const dockerCompose = readFileSync(
  join(process.cwd(), "docker-compose.yml"),
  "utf8",
);

const KNOWN_BAD_PLACEHOLDERS = [
  "replace-with-64-hex-characters",
  "replace-with-base64-32-byte-key",
  "replace-with-cloudflare-api-token-min-40-chars",
  "replace-with-openssl-rand-base64-32",
  "your-cloudflare-account-id",
  "your-r2-access-key-id",
  "your-r2-secret-access-key",
] as const;

function parseEnvExample(content: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Z_][A-Z0-9_]*)="([^"]*)"/u.exec(trimmed);
    if (match) {
      const key = match[1];
      const value = match[2] ?? "";
      if (key) {
        entries.set(key, value);
      }
    }
  }

  return entries;
}

const isHex64 = (value: string): boolean => /^[0-9a-fA-F]{64}$/u.test(value);

const isBase64EncodedAesKey = (value: string): boolean => {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    return false;
  }

  const decodedKey = Buffer.from(value, "base64");
  return [16, 24, 32].includes(decodedKey.length);
};

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

  test("documents Neon DIRECT_URL alongside DATABASE_URL for Prisma CLI", () => {
    expect(envExample).toContain(
      'DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/myrrh_rental"',
    );
    expect(envExample).toContain("Never point local at production Neon");
  });

  test("documents an isolated local test database for real-DB integration tests", () => {
    expect(envExample).toContain(
      'TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/myrrh_test"',
    );
    expect(dockerCompose).toContain("test-db:");
    expect(dockerCompose).toContain("POSTGRES_DB: myrrh_test");
    expect(dockerCompose).toContain('"5433:5432"');
  });

  test("does not ship known-invalid placeholder substrings as assigned values", () => {
    const entries = parseEnvExample(envExample);

    for (const [, value] of entries) {
      for (const bad of KNOWN_BAD_PLACEHOLDERS) {
        expect(value).not.toContain(bad);
      }
    }
  });

  test("keeps constrained secrets empty or in a valid format for cold-start Zod parsing", () => {
    const entries = parseEnvExample(envExample);
    const isEmpty = (value: string | undefined): boolean =>
      value === undefined || value === "";

    for (const key of ["ENCRYPTION_KEY", "AUDIT_LOG_HMAC_KEY"] as const) {
      const value = entries.get(key);
      expect(isEmpty(value) || isHex64(value ?? "")).toBe(true);
    }

    const originSecret = entries.get("CLOUDFLARE_ORIGIN_HEADER_SECRET");
    expect(isEmpty(originSecret) || (originSecret?.length ?? 0) >= 32).toBe(
      true,
    );

    const serverActionsKey = entries.get("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY");
    expect(
      isEmpty(serverActionsKey) ||
        isBase64EncodedAesKey(serverActionsKey ?? ""),
    ).toBe(true);

    const betterAuthSecret = entries.get("BETTER_AUTH_SECRET");
    expect(betterAuthSecret).toBeDefined();
    expect((betterAuthSecret?.length ?? 0) >= 32).toBe(true);
  });
});
