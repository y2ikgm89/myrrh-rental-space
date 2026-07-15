import { describe, test, expect, mock, beforeEach } from "bun:test";

// Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#7 (backfill 部分)。
// /api/cron/receipt-backfill Route Handler の認可・feature gate・分岐を境界 mock で検証。
mock.module("server-only", () => ({}));

const mockAuthorize =
  mock<
    (opts: { request: Request; operation: string }) => Promise<Response | null>
  >();
const mockIsFeatureEnabled = mock<(id: string) => Promise<boolean>>();
const mockBackfill = mock<
  () => Promise<{
    issuedReservations: number;
    skippedReservations: number;
    errorReservations: number;
    issuedEventRegistrations: number;
    skippedEventRegistrations: number;
    errorEventRegistrations: number;
  }>
>();
const mockLogError = mock<(error: unknown, opts?: unknown) => void>();
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
}));
mock.module("next/navigation", () => ({
  // 実 Next.js の unstable_rethrow は「Next.js 内部エラーのみ rethrow、それ以外は
  // no-op」。テストで Next.js 内部エラーは投げられないので mock は no-op で足りる。
  unstable_rethrow: () => undefined,
}));
mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (opts: { request: Request; operation: string }) =>
    mockAuthorize(opts),
}));
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (id: string) => mockIsFeatureEnabled(id),
}));
mock.module("@/shared/domain/receipts/backfill", () => ({
  backfillReceipts: () => mockBackfill(),
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

const { GET } = await import("@/app/api/cron/receipt-backfill/route");

function makeRequest() {
  return new Request("http://localhost/api/cron/receipt-backfill");
}

describe("/api/cron/receipt-backfill", () => {
  beforeEach(() => {
    mockAuthorize.mockReset();
    mockIsFeatureEnabled.mockReset();
    mockBackfill.mockReset();
    mockLogError.mockReset();
  });

  test("cron 認可失敗 → authorizeCronRequest の Response を即返し、feature gate / backfill は呼ばれない", async () => {
    mockAuthorize.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  test("認可成功 + payment feature OFF → skipped で 200、backfill は呼ばれない", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockIsFeatureEnabled.mockResolvedValueOnce(false);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: boolean; reason?: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("feature_disabled");
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  test("認可成功 + payment feature ON → backfillReceipts を実行しサマリを返却", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockBackfill.mockResolvedValueOnce({
      issuedReservations: 3,
      skippedReservations: 1,
      errorReservations: 0,
      issuedEventRegistrations: 2,
      skippedEventRegistrations: 0,
      errorEventRegistrations: 0,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { issuedReservations?: number };
    expect(body.issuedReservations).toBe(3);
    expect(mockBackfill).toHaveBeenCalledTimes(1);
  });

  test("backfillReceipts が throw したら 500 で logError", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const dbError = new Error("DB temporarily unavailable");
    mockBackfill.mockRejectedValueOnce(dbError);

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("errorReservations / errorEventRegistrations が 1 件以上なら 500 で Cloud Scheduler retry を trigger (Codex P2 対応)", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockBackfill.mockResolvedValueOnce({
      issuedReservations: 5,
      skippedReservations: 2,
      errorReservations: 1, // ← transient error
      issuedEventRegistrations: 3,
      skippedEventRegistrations: 0,
      errorEventRegistrations: 0,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("errors 0 なら通常通り 200 (VALIDATION による skipped は errors ではない)", async () => {
    mockAuthorize.mockResolvedValueOnce(null);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockBackfill.mockResolvedValueOnce({
      issuedReservations: 5,
      skippedReservations: 3, // VALIDATION skipped は問題なし
      errorReservations: 0,
      issuedEventRegistrations: 2,
      skippedEventRegistrations: 1,
      errorEventRegistrations: 0,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
