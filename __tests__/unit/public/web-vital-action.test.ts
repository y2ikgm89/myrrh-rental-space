import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * `reportWebVitalAction` は同意済みブラウザからの計測サンプルを
 * `message=web_vital` の構造化ログとして 1 行書く。log-based metric の
 * DISTRIBUTION がこのログから作られるので、**何を捨てるか**が指標の正しさを決める。
 *
 * 監査 A-49: 以前は「未知の名前」と「非有限値」の 2 つしか捨てておらず、
 * rate limit も値域の上限も無かった。RSC ペイロードから action ID を取れば
 * 誰でも無制限に書き込め、p95 を任意の値へ動かせた。
 */

const mockLoggerInfo = mock<(message: string, context?: unknown) => void>(
  () => undefined,
);
mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: mockLoggerInfo,
    debug: () => {},
    warn: () => {},
    error: () => {},
  },
}));

let rateLimitAllowed = true;
const mockCheckActionRateLimit = mock(() =>
  Promise.resolve(
    rateLimitAllowed
      ? { success: true as const }
      : { success: false as const, error: "リクエストが多すぎます" },
  ),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

const { reportWebVitalAction } = await import("@/public/actions/web-vital");

beforeEach(() => {
  mockLoggerInfo.mockClear();
  mockCheckActionRateLimit.mockClear();
  rateLimitAllowed = true;
});

describe("reportWebVitalAction", () => {
  test("許可された指標は 1 行だけ記録する", async () => {
    await reportWebVitalAction({ name: "LCP", value: 1234.5 });
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith("web_vital", {
      metric: "LCP",
      value: 1235,
    });
  });

  test("CLS は 1000 倍の整数で記録する", async () => {
    await reportWebVitalAction({ name: "CLS", value: 0.12 });
    expect(mockLoggerInfo).toHaveBeenCalledWith("web_vital", {
      metric: "CLS",
      value: 120,
    });
  });

  test("未知の指標名と非有限値は捨てる", async () => {
    await reportWebVitalAction({ name: "FID", value: 10 });
    await reportWebVitalAction({ name: "LCP", value: Number.NaN });
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  /**
   * 監査 A-49 の本体。実測としてありえない大きさのサンプルを 1 件混ぜるだけで
   * DISTRIBUTION の p95 は実態と無関係な値になる。
   */
  test("指標ごとの上限を超える値は捨てる", async () => {
    await reportWebVitalAction({ name: "LCP", value: 900_000 });
    await reportWebVitalAction({ name: "CLS", value: 10_000 });
    await reportWebVitalAction({ name: "LCP", value: -1 });
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  test("上限ちょうどは通す（境界）", async () => {
    await reportWebVitalAction({ name: "LCP", value: 60_000 });
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
  });

  test("rate limit に掛かったら記録しない", async () => {
    rateLimitAllowed = false;
    await reportWebVitalAction({ name: "LCP", value: 1000 });
    expect(mockCheckActionRateLimit).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  test("捨てる値では rate limit を消費しない（正常な計測を巻き添えにしない）", async () => {
    await reportWebVitalAction({ name: "FID", value: 10 });
    expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
  });
});
