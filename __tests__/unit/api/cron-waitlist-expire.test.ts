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

type PaymentContext =
  | { kind: "free"; confirmUrl: string }
  | { kind: "paid"; checkoutUrl: string; price: number };

const mockGetEventWaitlistOfferPaymentContext = mock<
  (registrationId: string) => Promise<PaymentContext | null>
>(() =>
  Promise.resolve({
    kind: "free",
    confirmUrl: "https://example.com/events/waitlist/confirm?token=t",
  }),
);

const mockSendEventWaitlistExpired = mock<
  (args: { registrationId: string; to: string }) => Promise<{ ok: boolean }>
>(() => Promise.resolve({ ok: true }));

const mockSendEventWaitlistOffered = mock<
  (args: {
    registrationId: string;
    to: string;
    expiresAt: Date;
    paymentContext: PaymentContext;
  }) => Promise<{ ok: boolean }>
>(() => Promise.resolve({ ok: true }));

// fireAndForget を「発火した Promise を配列に集める」だけの同期的な mock に
// 差し替える。実装（after() 経由の完了追跡）はリクエストスコープ外で
// 同期的に throw → 内部 catch でデタッチ実行にフォールバックするため本来は
// 実体のままでも壊れないが、テスト側で「メール送信 mock が呼ばれ終わるまで
// 確実に待つ」ための決定的な待ち合わせポイントが無いと race になる
// （event-waitlist-register.test.ts と同じ理由・同じパターン）。
let firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

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
  getEventWaitlistOfferPaymentContext: (
    ...args: Parameters<typeof mockGetEventWaitlistOfferPaymentContext>
  ) => mockGetEventWaitlistOfferPaymentContext(...args),
}));

mock.module("@/shared/domain/events/waitlist-commands", () => ({
  expireAndPromoteWaitlistForEventCommand: (
    ...args: Parameters<typeof mockExpireAndPromoteWaitlistForEventCommand>
  ) => mockExpireAndPromoteWaitlistForEventCommand(...args),
}));

mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistExpired: (
    ...args: Parameters<typeof mockSendEventWaitlistExpired>
  ) => mockSendEventWaitlistExpired(...args),
  sendEventWaitlistOffered: (
    ...args: Parameters<typeof mockSendEventWaitlistOffered>
  ) => mockSendEventWaitlistOffered(...args),
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
    mockGetEventWaitlistOfferPaymentContext.mockReset();
    mockSendEventWaitlistExpired.mockReset();
    mockSendEventWaitlistOffered.mockReset();
    firedPromises.length = 0;

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
    mockGetEventWaitlistOfferPaymentContext.mockResolvedValue({
      kind: "free",
      confirmUrl: "https://example.com/events/waitlist/confirm?token=t",
    });
    mockSendEventWaitlistExpired.mockResolvedValue({ ok: true });
    mockSendEventWaitlistOffered.mockResolvedValue({ ok: true });
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

  test("候補あり（1 event）+ 成功 → expired/offered をカウントし cache を無効化し、期限切れ/繰り上げ当選メールを送信する（final review I1）", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([makeCandidate()]);
    const offeredExpiresAt = new Date("2026-07-15T00:00:00Z");
    mockExpireAndPromoteWaitlistForEventCommand.mockResolvedValue({
      expired: [
        { id: "reg-1", name: "山田 太郎", email: "customer@example.com" },
      ],
      offered: [
        {
          id: "reg-2",
          email: "next@example.com",
          offeredAt: new Date("2026-07-14T00:00:00Z"),
          expiresAt: offeredExpiresAt,
        },
      ],
    });

    const response = await GET(makeSchedulerRequest());
    // ループ内の fireAndForget はレスポンスを待たない。決定的に完了を待ち合わせる。
    await Promise.all(firedPromises);

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
      CACHE_TAGS.EVENT_WAITLIST,
    ]);

    // I1: cron の EXPIRED 遷移・繰り上げ当選それぞれで通知メールが送られる
    // （旧実装は TODO(task-6) スタブのままで一切送信していなかった）。
    expect(mockSendEventWaitlistExpired).toHaveBeenCalledTimes(1);
    expect(mockSendEventWaitlistExpired).toHaveBeenCalledWith({
      registrationId: "reg-1",
      to: "customer@example.com",
    });

    expect(mockGetEventWaitlistOfferPaymentContext).toHaveBeenCalledWith(
      "reg-2",
    );
    expect(mockSendEventWaitlistOffered).toHaveBeenCalledTimes(1);
    expect(mockSendEventWaitlistOffered).toHaveBeenCalledWith({
      registrationId: "reg-2",
      to: "next@example.com",
      expiresAt: offeredExpiresAt,
      paymentContext: {
        kind: "free",
        confirmUrl: "https://example.com/events/waitlist/confirm?token=t",
      },
    });
  });

  test("expired/offered の email が null の候補はメール送信を skip する", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([makeCandidate()]);
    mockExpireAndPromoteWaitlistForEventCommand.mockResolvedValue({
      expired: [{ id: "reg-1", name: "山田 太郎", email: null }],
      offered: [
        {
          id: "reg-2",
          email: null,
          offeredAt: new Date("2026-07-14T00:00:00Z"),
          expiresAt: new Date("2026-07-15T00:00:00Z"),
        },
      ],
    });

    const response = await GET(makeSchedulerRequest());
    await Promise.all(firedPromises);

    expect(response.status).toBe(200);
    const body = await response.json();
    // カウント自体は email の有無と無関係に反映される
    expect(body).toEqual({ expired: 1, offered: 1 });
    expect(mockSendEventWaitlistExpired).not.toHaveBeenCalled();
    expect(mockGetEventWaitlistOfferPaymentContext).not.toHaveBeenCalled();
    expect(mockSendEventWaitlistOffered).not.toHaveBeenCalled();
  });

  test("繰り上げ当選後に getEventWaitlistOfferPaymentContext が null（対象が直後に消えた極端な race）→ LOW で logError し送信は諦める", async () => {
    mockFindExpiredWaitlistOfferCandidates.mockResolvedValue([makeCandidate()]);
    mockExpireAndPromoteWaitlistForEventCommand.mockResolvedValue({
      expired: [],
      offered: [
        {
          id: "reg-2",
          email: "next@example.com",
          offeredAt: new Date("2026-07-14T00:00:00Z"),
          expiresAt: new Date("2026-07-15T00:00:00Z"),
        },
      ],
    });
    mockGetEventWaitlistOfferPaymentContext.mockResolvedValue(null);

    const response = await GET(makeSchedulerRequest());
    await Promise.all(firedPromises);

    expect(response.status).toBe(200);
    expect(mockSendEventWaitlistOffered).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        category: "DATABASE",
        severity: "LOW",
        context: expect.objectContaining({
          operation: "waitlistExpireCron",
          registrationId: "reg-2",
          eventId: "event-1",
        }),
      }),
    );
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
