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
    CRON_OIDC_AUDIENCE: "https://rental-space.example.com",
    CRON_SERVICE_ACCOUNT_EMAIL:
      "myrrh-rental-space-scheduler@example.iam.gserviceaccount.com",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    ENCRYPTION_KEY: "a".repeat(64),
    NEXT_PUBLIC_APP_URL: "https://rental-space.example.com",
    NEXT_PUBLIC_BASE_URL: "https://rental-space.example.com",
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    R2_ACCESS_KEY_ID: "test-r2-access-key-id",
    R2_ACCOUNT_ID: "test-r2-account-id",
    R2_BUCKET_NAME: "test-r2-bucket",
    R2_PUBLIC_URL: "https://cdn.example.com",
    R2_SECRET_ACCESS_KEY: "test-r2-secret-access-key",
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
});
