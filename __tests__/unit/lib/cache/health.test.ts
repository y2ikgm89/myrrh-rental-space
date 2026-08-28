import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const loggerWarn = mock();

mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: mock(),
    warn: loggerWarn,
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

const { assertCloudflareCredentials, CANARY_ABORT_BUDGET_MS } =
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
    loggerWarn.mockReset();
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

    // 実行時 purge と同じ条件（既定の 10s + retry）で呼ぶ。以前は
    // `{ retry: false, signal: AbortSignal.timeout(5_000) }` を渡していたが、
    // 実際には起きない厳しい条件を測って空振りし続けていた。
    expect(callPurgeApiPublic).toHaveBeenCalledWith(
      "a".repeat(32),
      "test-token",
      {
        tags: ["cdn-tag-purge-canary-v1"],
      },
      // PR #2762 がこの 2 つを一度外した（監査 F-72 の決定を無自覚に覆した）。
      // 元に戻したことをここで固定する。
      expect.objectContaining({
        retry: false,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(logError).toHaveBeenCalledTimes(1);
    const loggedError = logError.mock.calls[0]?.[0];
    expect(loggedError).toBeInstanceOf(Error);
    expect((loggedError as Error).message).toContain(
      "Cloudflare tag purge startup canary failed",
    );
    expect((loggedError as Error).message).not.toContain("falling");
  });
  test("一過性の失敗 (transient) は HIGH で鳴らさず warn に落とす", async () => {
    // **timeout も認証エラーも `success: false` である。**
    // 上のテストと同じ形の失敗で扱いが割れることがこの gate の要点。
    getCloudflareCredentialsValidated.mockReturnValue({
      zoneId: "a".repeat(32),
      apiToken: "test-token",
    });
    callPurgeApiPublic.mockResolvedValue({
      success: false,
      error: "タイムアウトしました",
      transient: true,
    });

    await assertCloudflareCredentials();

    expect(logError).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });

  test("canary が成功したら何も鳴らさない", async () => {
    getCloudflareCredentialsValidated.mockReturnValue({
      zoneId: "a".repeat(32),
      apiToken: "test-token",
    });
    callPurgeApiPublic.mockResolvedValue({ success: true });

    await assertCloudflareCredentials();

    expect(logError).not.toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  test("abort budget outlives cold-start event-loop congestion", () => {
    // 5 秒だった頃、この probe は Cloudflare ではなく cold start の輻輳を測っていた。
    // Cloud Logging 実測（2026-08-20〜27）で "Ready" から結果ログまでの最悪値は
    // 11.81 秒。20 秒はそこに約 1.7 倍の余裕を残した下限で、これを割ると
    // TimeoutError が HIGH severity のノイズとして戻る。
    expect(CANARY_ABORT_BUDGET_MS).toBeGreaterThanOrEqual(20_000);
  });
});

describe("instrumentation.register Cloudflare startup", () => {
  test("does not await the Cloudflare canary on the boot path", () => {
    const source = readFileSync(
      join(process.cwd(), "src/instrumentation.ts"),
      "utf8",
    );

    expect(source).toContain("getCloudflareCredentialsValidated");
    expect(source).not.toMatch(/await\s+assertCloudflareCredentials\s*\(/);
  });
});
