import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { CACHE_TAGS } from "@/shared/lib/constants";

// --- モック関数の定義（mock.module() より前）---

type WaitlistCandidate = {
  id: string;
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string | null;
};

type ExpirePromoteResult = {
  expired: { id: string; name: string; email: string | null }[];
  offered: {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  }[];
};

const mockFindExpiredWaitlistOfferCandidates = mock<
  (now: Date) => Promise<WaitlistCandidate[]>
>(() => Promise.resolve([]));

const mockExpireAndPromoteWaitlistForEventCommand = mock<
  (args: {
    eventId: string;
    candidates: readonly WaitlistCandidate[];
    now: Date;
  }) => Promise<ExpirePromoteResult>
>(() => Promise.resolve({ expired: [], offered: [] }));

const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[], options?: unknown) => void
>(() => undefined);

const mockLogError = mock<(error: unknown, opts?: unknown) => void>(
  () => undefined,
);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/events/waitlist-queries", () => ({
  findExpiredWaitlistOfferCandidates: (
    ...args: Parameters<typeof mockFindExpiredWaitlistOfferCandidates>
  ) => mockFindExpiredWaitlistOfferCandidates(...args),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  expireAndPromoteWaitlistForEventCommand: (
    ...args: Parameters<typeof mockExpireAndPromoteWaitlistForEventCommand>
  ) => mockExpireAndPromoteWaitlistForEventCommand(...args),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: (
    ...args: Parameters<typeof mockInvalidateSiteWideCacheFromRouteHandler>
  ) => mockInvalidateSiteWideCacheFromRouteHandler(...args),
}));

// @/shared/lib/constants はモック不要（純粋な定数ファイル、副作用なし。
// stripe-webhook.test.ts と同じ判断）。CACHE_TAGS.EVENTS はアサーション用に
// 実物を import する。

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (...args: Parameters<typeof mockIsFeatureEnabled>) =>
    mockIsFeatureEnabled(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/waitlist-expire/route");

// --- テスト用ヘルパー ---

function makeSchedulerRequest() {
  const headers = new Headers();
  headers.set("authorization", "Bearer cloud-scheduler-oidc-token");
  return new Request("http://localhost/api/cron/waitlist-expire", {
    headers,
  });
}

function makeCandidate(
  overrides: Partial<WaitlistCandidate> = {},
): WaitlistCandidate {
  return {
    id: "reg-1",
    eventId: "event-1",
    slotId: "slot-1",
    ticketId: "ticket-1",
    name: "山田 太郎",
    email: "customer@example.com",
    ...overrides,
  };
}

describe("GET /api/cron/waitlist-expire", () => {
  beforeEach(() => {
    mockFindExpiredWaitlistOfferCandidates.mockReset();
    mockExpireAndPromoteWaitlistForEventCommand.mockReset();
    mockInvalidateSiteWideCacheFromRouteHandler.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockIsFeatureEnabled.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    // デフォルト: 認証通過、feature ON、候補なし
    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([]);
    mockExpireAndPromoteWaitlistForEventCommand.mockResolvedValue({
      expired: [],
      offered: [],
    });
    mockInvalidateSiteWideCacheFromRouteHandler.mockReturnValue(undefined);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("Cloud Scheduler OIDC 認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)", async () => {
    const authErrorResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockAuthorizeCronRequest.mockResolvedValue(authErrorResponse);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockAuthorizeCronRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "waitlistExpireCron" }),
    );
    expect(mockFindExpiredWaitlistOfferCandidates).not.toHaveBeenCalled();
  });

  test("events feature module OFF → skipped:feature_disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "feature_disabled" });
    expect(mockFindExpiredWaitlistOfferCandidates).not.toHaveBeenCalled();
  });

  test("認可・feature 通過 + 期限切れ候補なし → expired=0, offered=0（cache 無効化なし）", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([]);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ expired: 0, offered: 0 });
    expect(mockExpireAndPromoteWaitlistForEventCommand).not.toHaveBeenCalled();
    expect(mockInvalidateSiteWideCacheFromRouteHandler).not.toHaveBeenCalled();
  });

  test("候補あり（1 event）+ 成功 → expired/offered をカウントし cache を無効化する", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([makeCandidate()]);
    mockExpireAndPromoteWaitlistForEventCommand.mockResolvedValue({
      expired: [
        { id: "reg-1", name: "山田 太郎", email: "customer@example.com" },
      ],
      offered: [
        {
          id: "reg-2",
          email: "next@example.com",
          offeredAt: new Date("2026-07-14T00:00:00Z"),
          expiresAt: new Date("2026-07-15T00:00:00Z"),
        },
      ],
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ expired: 1, offered: 1 });
    expect(mockExpireAndPromoteWaitlistForEventCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        candidates: [makeCandidate()],
      }),
    );
    expect(mockInvalidateSiteWideCacheFromRouteHandler).toHaveBeenCalledWith([
      CACHE_TAGS.EVENTS,
    ]);
  });

  test("複数 event: 1 event が例外 → 残りの event は継続処理し、例外は logError で記録する (500 にしない)", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([
      makeCandidate({ id: "reg-err", eventId: "event-err" }),
      makeCandidate({ id: "reg-ok", eventId: "event-ok" }),
    ]);
    const txError = new Error(
      "could not obtain lock on row in relation (tx timeout)",
    );
    mockExpireAndPromoteWaitlistForEventCommand.mockImplementation((args) => {
      if (args.eventId === "event-err") {
        return Promise.reject(txError);
      }
      return Promise.resolve({
        expired: [{ id: "reg-ok", name: "花子", email: "ok@example.com" }],
        offered: [],
      });
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    // event-err 分は失敗してカウントされないが、event-ok 分は反映される
    expect(body).toEqual({ expired: 1, offered: 0 });
    // 両方の event が試行されている（1 件の失敗が残りをブロックしていない証拠）
    expect(mockExpireAndPromoteWaitlistForEventCommand).toHaveBeenCalledTimes(
      2,
    );
    expect(mockLogError).toHaveBeenCalledWith(
      txError,
      expect.objectContaining({
        category: "DATABASE",
        severity: "MEDIUM",
        context: expect.objectContaining({
          operation: "waitlistExpireCron",
          eventId: "event-err",
          candidateCount: 1,
        }),
      }),
    );
    // 例外は outer catch (500 系) に伝播していない
    expect(mockUnstableRethrow).not.toHaveBeenCalled();
  });

  test("findExpiredWaitlistOfferCandidates が例外をスロー（outer catch）→ 500 を返す", async () => {
    const dbError = new Error("Database connection failed");
    mockFindExpiredWaitlistOfferCandidates.mockRejectedValue(dbError);
    // unstable_rethrow は Next.js internal error 用（NEXT_REDIRECT 等）だけを再 throw。
    // ここの Error は通常エラー扱いで catch 節が受け取り、logError → jsonError 500 になる。
    mockUnstableRethrow.mockImplementation(() => undefined);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal error" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        category: "DATABASE",
        severity: "HIGH",
        context: expect.objectContaining({
          operation: "waitlistExpireCron",
        }),
      }),
    );
  });
});
