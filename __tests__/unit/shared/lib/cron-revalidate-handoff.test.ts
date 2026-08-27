/**
 * 予約公開の再検証ハンドオフ（`src/shared/lib/cron-revalidate-handoff.ts`）
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

let handoffUrl: string | undefined;
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    get CRON_REVALIDATE_HANDOFF_URL() {
      return handoffUrl;
    },
  },
}));

const mockRequest = mock(
  async (_opts: { url: string; method: string }): Promise<{ status: number }> =>
    Promise.resolve({ status: 200 }),
);
const mockGetIdTokenClient = mock(async (_audience: string) =>
  Promise.resolve({ request: mockRequest }),
);
mock.module("google-auth-library", () => ({
  GoogleAuth: class {
    getIdTokenClient = mockGetIdTokenClient;
  },
}));

const { dispatchRevalidationHandoff } =
  await import("@/shared/lib/cron-revalidate-handoff");

describe("dispatchRevalidationHandoff", () => {
  beforeEach(() => {
    mockLogError.mockClear();
    mockRequest.mockClear();
    mockGetIdTokenClient.mockClear();
    handoffUrl = undefined;
  });

  test("宛先が未設定なら何も送らず false を返す（= 自分が public 側）", async () => {
    const result = await dispatchRevalidationHandoff("/api/cron/x", "op");

    expect(result).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test("宛先が設定されていれば、その URL を audience にした OIDC で叩く", async () => {
    handoffUrl = "https://public.example.com";

    const result = await dispatchRevalidationHandoff(
      "/api/cron/news-scheduled-publish",
      "op",
    );

    expect(result).toBe(true);
    expect(mockGetIdTokenClient).toHaveBeenCalledWith(
      "https://public.example.com",
    );
    expect(mockRequest).toHaveBeenCalledWith({
      url: "https://public.example.com/api/cron/news-scheduled-publish",
      method: "GET",
    });
  });

  test("送信が失敗したら false を返す（呼び出し側がフォールバックできる）", async () => {
    handoffUrl = "https://public.example.com";
    mockRequest.mockImplementationOnce(() =>
      Promise.reject(new Error("connect ECONNREFUSED")),
    );

    const result = await dispatchRevalidationHandoff("/api/cron/x", "op");

    expect(result).toBe(false);
    expect(mockLogError).toHaveBeenCalled();
  });

  test("非 2xx で返ってきたら false を返す", async () => {
    handoffUrl = "https://public.example.com";
    mockRequest.mockImplementationOnce(() => Promise.resolve({ status: 503 }));

    const result = await dispatchRevalidationHandoff("/api/cron/x", "op");

    expect(result).toBe(false);
  });
});
