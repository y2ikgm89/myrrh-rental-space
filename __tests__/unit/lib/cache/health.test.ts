import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getCloudflareCredentialsValidated = mock();
const callPurgeApiPublic = mock();
const logError = mock();
const mockServerEnv: {
  E2E_RUNTIME: string | undefined;
} = {
  E2E_RUNTIME: undefined,
};

mock.module("@/shared/lib/cloudflare", () => ({
  getCloudflareCredentialsValidated,
  callPurgeApiPublic,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError,
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH" },
}));

mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: mock(),
    warn: mock(),
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

const { assertCloudflareCredentials } =
  await import("@/shared/lib/cache/health");

const originalNodeEnv = process.env["NODE_ENV"];

function setNodeEnv(value: "development" | "production" | "test"): void {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

describe("assertCloudflareCredentials", () => {
  beforeEach(() => {
    setNodeEnv("production");
    mockServerEnv.E2E_RUNTIME = undefined;
    getCloudflareCredentialsValidated.mockReset();
    callPurgeApiPublic.mockReset();
    logError.mockReset();
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      setNodeEnv(originalNodeEnv as "development" | "production" | "test");
    }
  });

  test("skips the external startup probe for production-mode E2E runtime", async () => {
    mockServerEnv.E2E_RUNTIME = "1";

    await assertCloudflareCredentials();

    expect(getCloudflareCredentialsValidated).not.toHaveBeenCalled();
    expect(callPurgeApiPublic).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  test("reports missing Cloudflare credentials in real production runtime", async () => {
    getCloudflareCredentialsValidated.mockReturnValue(null);

    await assertCloudflareCredentials();

    expect(getCloudflareCredentialsValidated).toHaveBeenCalledTimes(1);
    expect(callPurgeApiPublic).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  test("reports tag purge canary failure as an operational error", async () => {
    getCloudflareCredentialsValidated.mockReturnValue({
      zoneId: "a".repeat(32),
      apiToken: "test-token",
    });
    callPurgeApiPublic.mockResolvedValue({
      success: false,
      error: "tag purge permission denied",
    });

    await assertCloudflareCredentials();

    expect(callPurgeApiPublic).toHaveBeenCalledWith(
      "a".repeat(32),
      "test-token",
      {
        tags: ["cdn-tag-purge-canary-v1"],
      },
    );
    expect(logError).toHaveBeenCalledTimes(1);
    const loggedError = logError.mock.calls[0]?.[0];
    expect(loggedError).toBeInstanceOf(Error);
    expect((loggedError as Error).message).toContain(
      "Cloudflare tag purge startup canary failed",
    );
    expect((loggedError as Error).message).not.toContain("falling");
  });
});
