import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockFindReservationsForReminderWindow = mock<
  () => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

const mockSendReservationReminderEmail = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

const mockLogError = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Response | null>(() => null);

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/reservations/admin-queries", () => ({
  findReservationsForReminderWindow: (
    ...args: Parameters<typeof mockFindReservationsForReminderWindow>
  ) => mockFindReservationsForReminderWindow(...args),
}));

mock.module("@/shared/lib/email/reminder-emails", () => ({
  sendReservationReminderEmail: (
    ...args: Parameters<typeof mockSendReservationReminderEmail>
  ) => mockSendReservationReminderEmail(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
  createErrorLogger: mock(() => ({
    error: mock(),
    warn: mock(),
    info: mock(),
  })),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ReservationOverlapError: class extends Error {
    readonly code = "RESERVATION_OVERLAP" as const;
    constructor(message = "選択された時間帯は既に予約されています") {
      super(message);
      this.name = "ReservationOverlapError";
    }
  },
  isReservationOverlapError: (error: unknown) =>
    error instanceof Error && error.name === "ReservationOverlapError",
  safeFetch: mock(async (opts: { fetch: () => unknown; fallback: unknown }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  }),
  criticalFetch: mock(async (opts: { fetch: () => unknown }) => opts.fetch()),
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

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    CRON_SECRET: "test-secret",
    NODE_ENV: "test",
  },
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  getRouteErrorStatus: (message: string) =>
    message.includes("ログイン") || message.includes("権限") ? 403 : 400,
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
  jsonValidationError: mock(() =>
    NextResponse.json({ error: "入力内容に誤りがあります" }, { status: 400 }),
  ),
}));

const { GET } = await import("@/app/api/cron/reservation-reminder/route");

// --- テスト用ヘルパー ---

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/reservation-reminder", {
    headers,
  });
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    startTime: new Date("2026-03-29T10:00:00Z"),
    endTime: new Date("2026-03-29T12:00:00Z"),
    notes: null,
    space: {
      name: "テストスペース",
      location: { name: "テストロケーション" },
    },
    customer: {
      email: "customer@example.com",
      firstName: "太郎",
      lastName: "山田",
    },
    ...overrides,
  };
}

describe("GET /api/cron/reservation-reminder", () => {
  beforeEach(() => {
    mockFindReservationsForReminderWindow.mockReset();
    mockSendReservationReminderEmail.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockUnstableRethrow.mockReset();

    // デフォルト: 認証通過、予約なし、メール送信成功
    mockAuthorizeCronRequest.mockReturnValue(null);
    mockFindReservationsForReminderWindow.mockResolvedValue([]);
    mockSendReservationReminderEmail.mockResolvedValue(undefined);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)", async () => {
    const authErrorResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockAuthorizeCronRequest.mockReturnValue(authErrorResponse);

    const response = await GET(makeRequest("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockFindReservationsForReminderWindow).not.toHaveBeenCalled();
  });

  test("予約なし → sent=0, skipped=0, total=0 を返す", async () => {
    mockFindReservationsForReminderWindow.mockResolvedValue([]);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 0, total: 0 });
    expect(mockSendReservationReminderEmail).not.toHaveBeenCalled();
  });

  test("予約あり + メール送信成功 → sent=1", async () => {
    const reservation = makeReservation();
    mockFindReservationsForReminderWindow.mockResolvedValue([reservation]);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 1, skipped: 0, total: 1 });
    expect(mockSendReservationReminderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendReservationReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        customerEmail: "customer@example.com",
        customerName: "山田 太郎",
        spaceName: "テストスペース",
      }),
    );
  });

  test("顧客メールなし → skipped=1", async () => {
    const reservation = makeReservation({
      customer: { email: null, firstName: "太郎", lastName: "山田" },
    });
    mockFindReservationsForReminderWindow.mockResolvedValue([reservation]);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockSendReservationReminderEmail).not.toHaveBeenCalled();
  });

  test("顧客情報なし (customer=null) → skipped=1", async () => {
    const reservation = makeReservation({ customer: null });
    mockFindReservationsForReminderWindow.mockResolvedValue([reservation]);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockSendReservationReminderEmail).not.toHaveBeenCalled();
  });

  test("メール送信エラー → skipped=1 + logError 呼び出し", async () => {
    const reservation = makeReservation();
    mockFindReservationsForReminderWindow.mockResolvedValue([reservation]);
    const emailError = new Error("SMTP connection failed");
    mockSendReservationReminderEmail.mockRejectedValue(emailError);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 0, skipped: 1, total: 1 });
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      emailError,
      expect.objectContaining({
        context: expect.objectContaining({
          operation: "reservationReminder",
          reservationId: "res-1",
        }),
      }),
    );
  });

  test("複数予約: 成功2 + スキップ1 (メールなし)", async () => {
    const reservations = [
      makeReservation({ id: "res-1" }),
      makeReservation({
        id: "res-2",
        customer: { email: null, firstName: "花子", lastName: "鈴木" },
      }),
      makeReservation({ id: "res-3" }),
    ];
    mockFindReservationsForReminderWindow.mockResolvedValue(reservations);

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ sent: 2, skipped: 1, total: 3 });
    expect(mockSendReservationReminderEmail).toHaveBeenCalledTimes(2);
  });

  test("顧客氏名が空の場合 → customerName は 'お客様'", async () => {
    const reservation = makeReservation({
      customer: {
        email: "customer@example.com",
        firstName: "",
        lastName: "",
      },
    });
    mockFindReservationsForReminderWindow.mockResolvedValue([reservation]);

    await GET(makeRequest("Bearer test-secret"));

    expect(mockSendReservationReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ customerName: "お客様" }),
    );
  });

  test("findReservationsForReminderWindow が例外をスロー → 500 を返す", async () => {
    const dbError = new Error("Database connection failed");
    mockFindReservationsForReminderWindow.mockRejectedValue(dbError);
    // unstable_rethrow は通常エラーを再スローしない（Next.js bail out 以外）
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal error" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        context: expect.objectContaining({
          operation: "reservationReminderCron",
        }),
      }),
    );
  });
});
