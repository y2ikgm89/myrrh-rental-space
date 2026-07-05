import { Buffer } from "node:buffer";

import { afterEach, describe, expect, test } from "bun:test";

import { setNodeEnv } from "../../../helpers/env";

const originalEnv = { ...process.env };
let importCounter = 0;

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      Reflect.deleteProperty(process.env, key);
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

function setProductionEnv(
  overrides: Record<string, string | undefined> = {},
): void {
  Reflect.deleteProperty(process.env, "SKIP_ENV_VALIDATION");
  setNodeEnv("production");

  Object.assign(process.env, {
    APP_SURFACE: "public",
    ADMIN_APP_URL: "https://myrrh-rental-space-admin.example.com",
    AUDIT_LOG_HMAC_KEY: "a".repeat(64),
    BETTER_AUTH_SECRET: "a".repeat(32),
    BETTER_AUTH_URL: "https://rental-space.example.com",
    CLOUDFLARE_ORIGIN_HEADER_SECRET: "c".repeat(32),
    CRON_OIDC_AUDIENCE: "https://rental-space.example.com",
    CRON_SERVICE_ACCOUNT_EMAIL:
      "myrrh-rental-space-scheduler@example.iam.gserviceaccount.com",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    ENCRYPTION_KEY: "a".repeat(64),
    NEXT_PUBLIC_APP_URL: "https://rental-space.example.com",
    NEXT_PUBLIC_BASE_URL: "https://rental-space.example.com",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    R2_ACCESS_KEY_ID: "test-r2-access-key-id",
    R2_ACCOUNT_ID: "test-r2-account-id",
    R2_BUCKET_NAME: "test-r2-bucket",
    R2_PUBLIC_URL: "https://cdn.example.com",
    R2_SECRET_ACCESS_KEY: "test-r2-secret-access-key",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  });

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

async function importServerEnv() {
  importCounter += 1;
  return import(
    `../../../../src/shared/lib/env/server.ts?production-env=${importCounter}`
  );
}

afterEach(() => {
  restoreEnv();
});

describe("server production env validation", () => {
  test("requires NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in production runtime validation", async () => {
    setProductionEnv({ NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).toThrow(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    );
  });

  test("rejects a non-base64 Next Server Actions encryption key", async () => {
    setProductionEnv({ NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "not-base64" });

    await expect(importServerEnv()).rejects.toThrow(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    );
  });

  test("accepts a base64-encoded 32-byte Next Server Actions encryption key", async () => {
    setProductionEnv();

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).not.toThrow();
  });

  test("requires Cloudflare origin header secret in production", async () => {
    setProductionEnv({ CLOUDFLARE_ORIGIN_HEADER_SECRET: undefined });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).toThrow(
      "CLOUDFLARE_ORIGIN_HEADER_SECRET",
    );
  });

  test("does not require Turnstile secret key in production because Settings is canonical", async () => {
    setProductionEnv({ TURNSTILE_SECRET_KEY: undefined });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).not.toThrow();
  });

  test("requires Turnstile site key in production", async () => {
    setProductionEnv({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).toThrow(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    );
  });

  test("rejects customer E2E login flag on real production URLs", async () => {
    setProductionEnv({ NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1" });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).toThrow(
      "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
    );
  });

  test("rejects admin test IAP fallback on real production URLs", async () => {
    setProductionEnv({
      APP_SURFACE: "admin",
      ADMIN_TEST_IAP_EMAIL: "admin@example.com",
      ADMIN_ROLE_GROUP_ADMIN_EMAIL: "admins@example.com",
      ADMIN_ROLE_GROUP_EDITOR_EMAIL: "editors@example.com",
      ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL: "super-admins@example.com",
      ADMIN_ROLE_GROUP_VIEWER_EMAIL: "viewers@example.com",
      IAP_JWT_AUDIENCE:
        "/projects/123456789012/locations/asia-northeast1/services/myrrh-rental-space-admin",
    });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).toThrow("ADMIN_TEST_IAP_EMAIL");
  });

  test("allows E2E bypass flags only for localhost production-mode tests", async () => {
    setProductionEnv({
      ADMIN_APP_URL: "http://localhost:3000",
      ADMIN_TEST_IAP_EMAIL: "admin@example.com",
      BETTER_AUTH_URL: "http://localhost:3000",
      E2E_RUNTIME: "1",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1",
    });

    const { validateProductionEnv } = await importServerEnv();

    expect(() => validateProductionEnv()).not.toThrow();
  });
});
