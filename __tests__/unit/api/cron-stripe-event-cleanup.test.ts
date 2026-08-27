import { describe, test, expect, mock, beforeEach } from "bun:test";

// STRIPE-DEDUP-B: /api/cron/stripe-event-cleanup route handler の
// 認可 (OIDC fail-closed)・分岐・エラーハンドリングを境界 mock で検証。
mock.module("server-only", () => ({}));

const mockAuthorize =
  mock<
    (opts: { request: Request; operation: string }) => Promise<Response | null>
  >();
const mockCleanup =
  mock<(now: Date) => Promise<{ retention: number; staleUnblock: number }>>();
const mockLogError = mock<(error: unknown, opts?: unknown) => void>();
const mockLoggerInfo = mock<(msg: string, ctx?: unknown) => void>();
const mockJsonSuccess = mock<(data: unknown, status?: number) => Response>(
  (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
);
const mockJsonError = mock<(msg: string, status: number) => Response>(
  (msg, status) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
);

mock.module("next/server", () => ({
  connection: async () => undefined,
  // async-utils が import する。部分 mock に足さないと
  // `Export named 'after' not found` でモジュールごと落ちる。
  // 本 route は withAwaitedSideEffects 経由なので after() は呼ばれないが、
  // 万一呼ばれても副作用が消えないよう実行する。
  after: (fn: () => unknown) => {
    void fn();
  },
}));
mock.module("next/navigation", () => ({
  unstable_rethrow: () => undefined,
}));
mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (opts: { request: Request; operation: string }) =>
    mockAuthorize(opts),
}));
mock.module("@/shared/domain/stripe-events/cleanup", () => ({
  cleanupOldStripeEvents: (now: Date) => mockCleanup(now),
}));
mock.module("@/shared/lib/route-responses", () => ({
  jsonSuccess: (data: unknown, status?: number) =>
    mockJsonSuccess(data, status),
  jsonError: (msg: string, status: number) => mockJsonError(msg, status),
}));
const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: unknown, opts?: unknown) => mockLogError(error, opts),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
}));
mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: (msg: string, ctx?: unknown) => mockLoggerInfo(msg, ctx),
  },
}));

const { GET } = await import("@/app/api/cron/stripe-event-cleanup/route");

function makeRequest() {
  return new Request("http://localhost/api/cron/stripe-event-cleanup");
}

describe("/api/cron/stripe-event-cleanup", () => {
  beforeEach(() => {
    mockAuthorize.mockReset();
    mockCleanup.mockReset();
    mockLogError.mockReset();
    mockLoggerInfo.mockReset();
  });

  test("cron 認可失敗 (missing / invalid OIDC token) → authorizeCronRequest の Response を即返し、cleanup は呼ばれない", async () => {
    mockAuthorize.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  test("認可成功 + cleanup 成功 → 200 と count サマリを返す", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockCleanup.mockResolvedValueOnce({ retention: 12, staleUnblock: 3 });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      retention?: number;
      staleUnblock?: number;
      executedAt?: string;
    };
    expect(body.retention).toBe(12);
    expect(body.staleUnblock).toBe(3);
    expect(typeof body.executedAt).toBe("string");
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
  });

  test("認可成功 + cleanup が throw → 500 + sanitized error message + logError", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    const dbError = new Error("DB temporarily unavailable");
    mockCleanup.mockRejectedValueOnce(dbError);

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    // internal error message は漏らさず一般化した文言で返す
    expect(body.error).toBe("Stripe event cleanup failed");
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("空 table (count 0/0) でも 200 で返す", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockCleanup.mockResolvedValueOnce({ retention: 0, staleUnblock: 0 });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      retention?: number;
      staleUnblock?: number;
    };
    expect(body.retention).toBe(0);
    expect(body.staleUnblock).toBe(0);
  });
});
