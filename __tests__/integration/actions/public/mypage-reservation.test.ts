/**
 * マイページ 予約 Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/reservation.ts のテスト
 *
 * テスト対象:
 * - cancelReservationAction: 予約キャンセル (RPC signature 維持 — button click 由来)
 * - updateReservationAction: 予約変更 (Phase 2 B-6 conform 化)
 *
 * Phase 2 conform 移行:
 *   `updateReservationAction(_prev, formData) => SubmissionResult` に signature 変更
 *   - `executeConformMutation` SSoT 経由 (default `resetForm: true`)
 *   - success: `{ initialValue: null }` (form は detail page に navigate)
 *   - form-level error (rate limit / auth / Turnstile / DomainError): `reply({ formErrors })`
 *
 * モック方針:
 * - getSession: auth をモック (認証状態を制御)
 * - getCustomerByUserId: domain クエリをモック
 * - cancelCustomerReservation / updateCustomerReservation: domain コマンドをモック
 * - getReservationDeadlineSettings: domain 設定クエリをモック
 * - checkActionRateLimit: action-helpers をモック / validateTurnstile: domain をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  expectSubmissionLike,
  expectErrorResult,
} from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

// server-only モック
mock.module("server-only", () => ({}));

// next/headers モック
mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

// next/cache モック
// 公式 Bun re-export pattern: actual を spread して必要 fn のみ override。
// partial mock は cacheTag/cacheLife 等を欠落させ、'use cache' 経路
// (getSuppressedEmailSet 等) を SyntaxError 化する。
const mockUpdateTag = mock(() => undefined);
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: mockUpdateTag,
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// レート制限モック
const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/domain/settings/turnstile", () => ({
  validateTurnstile: mockValidateTurnstile,
}));
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  // このファイルのテスト対象は使わないが、同一ファイルの submitReservation が
  // import するため、モジュール解決を通すために固定成功スタブを提供する。
  checkBotHeuristics: () => ({ success: true as const }),
  checkEmailRateLimit: () => Promise.resolve({ success: true as const }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  publicQueryRateLimiter: {},
  reservationSubmitRateLimiter: {},
  reservationByEmailRateLimiter: {},
  cancelByReservationRateLimiter: {
    check: mock(() => Promise.resolve({ success: true })),
  },
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

// 新規: applyCancellationSideEffects を no-op モック
mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: mock(() => Promise.resolve()),
}));

// 新規: updateReservationAction が変更通知メール送信に直接呼ぶ関数を no-op モック
installEmailLibDispatchMock({
  sendReservationAdminNotification: mock(() =>
    Promise.resolve({ ok: true, messageId: "msg_test" }),
  ),
  sendReservationUpdatedEmail: mock(() =>
    Promise.resolve({ ok: true, messageId: "msg_test" }),
  ),
  sendBulkReservationCancelledEmail: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
  sendBulkAdminNotification: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
});

// auth モック
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  customerAuth: { api: {} },
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
}));

mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mock(() => Promise.resolve(null)),
  getCurrentAdminUser: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  getAdminSessionUser: () => null,
  isAdmin: mock(() => Promise.resolve(false)),
  isValidRole: () => false,
  adminAuth: {},
  DASHBOARD_ROLES: [],
}));

// domain クエリモック
const mockGetCustomerByUserId = mock(
  (): Promise<{ id: string; lastName: string; firstName: string } | null> =>
    Promise.resolve({
      id: "customer-001",
      lastName: "山田",
      firstName: "太郎",
    }),
);

// 公式 Bun re-export pattern: payment-commands → notify-issued → send.ts が
// getSuppressedEmailSet を named import するため、partial mock だと
// 「Export named 'getSuppressedEmailSet' not found」でモジュール解決が落ちる。
const actualCustomersQueries =
  await import("@/shared/domain/customers/queries");
mock.module("@/shared/domain/customers/queries", () => ({
  ...actualCustomersQueries,
  getCustomerByUserId: mockGetCustomerByUserId,
  getSuppressedEmailSet: mock(() => Promise.resolve(new Set<string>())),
}));

// OAUTH-BETTER-AUTH-01: Server Action は assertCustomerActive を通す。
mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mock(() => Promise.resolve(undefined)),
  ensureCustomerNotBlacklisted: mock(() => Promise.resolve(undefined)),
}));

// Phase 2 (TERMS-REAGREE-P2): Server Action handler 冒頭に assertLoginSignupReagreed
// を追加したため、fixture 顧客 (LOGIN_SIGNUP scope 同意履歴なし) を通すため no-op に。
// assertAllRequiredTermsAgreed は本テストで未使用だが module 全体差し替えのため併記
// (未 mock だと undefined 化で参照側 TypeError になる)。
mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertAllRequiredTermsAgreed: mock(() =>
    Promise.resolve({ matchedTermsIds: [] }),
  ),
  assertLoginSignupReagreed: mock(() => Promise.resolve()),
}));

// Codex #1433: cancelReservationAction / updateReservationAction が
// reservation feature の独立 fail-closed gate を持つようになったため mock 必須。
const mockIsFeatureEnabled = mock(() => Promise.resolve(true));
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

// domain コマンドモック
const mockCancelCustomerReservation = mock<
  () => Promise<
    | { success: true; payload: { reservationId: string } }
    | { success: false; error: string }
  >
>(() =>
  Promise.resolve({ success: true, payload: { reservationId: "res-001" } }),
);

const mockUpdateCustomerReservation = mock<
  () => Promise<
    | { success: true; payload: { reservationId: string } }
    | { success: false; error: string }
  >
>(() =>
  Promise.resolve({ success: true, payload: { reservationId: "res-001" } }),
);

mock.module("@/shared/domain/reservations/customer-commands", () => ({
  cancelCustomerReservation: mockCancelCustomerReservation,
  updateCustomerReservation: mockUpdateCustomerReservation,
  // Phase B.2.1 Task 4: customer series cancel path。mock.module は module 全体を
  // 差し替えるため、export に加えないと本 test が起動時 undefined を掴んで落ちる。
  cancelCustomerReservationSeries: mock(() =>
    Promise.resolve({
      success: true,
      payload: { cancelledCount: 0 },
    }),
  ),
}));

// PR#14 で action が updateCustomerReservation の前に getReservationSnapshotForEdit を
// 呼び (SwitchBot 再発行のための old snapshot 取得)、成功後に applyReservationEditSideEffects
// を fireAndForget する。両者を no-op モックにする (mypage action test は
// updateCustomerReservation の入出力のみを検証する scope)。
mock.module("@/shared/domain/reservations/edit-side-effects", () => ({
  getReservationSnapshotForEdit: mock(() =>
    Promise.resolve({
      spaceId: "space-1",
      startTime: new Date("2026-12-01T00:00:00.000Z"),
      endTime: new Date("2026-12-01T02:00:00.000Z"),
    }),
  ),
  applyReservationEditSideEffects: mock(() =>
    Promise.resolve({ passcodes: [], issuanceFailed: false }),
  ),
}));

// SEC-MYPAGE-01: updateReservationAction が成功後に fireAndForget で
// createAuditLogRecord を呼ぶ (customer 経路にも AuditLog を残す fix)。
// 実 DB / hash chain を触らないよう no-op モック化する。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

// 変更通知メールで fetchReservationEmailData が呼ばれる。DB 経路を触らないよう
// no-op モック化する (payload なし → send{Reservation,Admin} は skip される)。
type MockReservationPayload = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number;
  icsSequence: number;
};
const mockFetchReservationEmailData = mock<
  () => Promise<MockReservationPayload | null>
>(() => Promise.resolve(null));
mock.module("@/shared/domain/reservations/payloads", () => ({
  fetchReservationEmailData: mockFetchReservationEmailData,
}));

// GCAL-OUTBOUND-01: updateReservationAction が成功後に GCal 同期を fireAndForget
// で発火する (admin updateReservationAction と同型)。
const mockSyncReservationToCalendar = mock(() =>
  Promise.resolve({ success: true }),
);
const mockUpdateCalendarSync = mock(() => Promise.resolve({ success: true }));
mock.module(
  "@/shared/domain/reservations/reservation-calendar-outbound",
  () => ({
    syncReservationToCalendar: mockSyncReservationToCalendar,
    updateCalendarSync: mockUpdateCalendarSync,
  }),
);

// 設定クエリモック
const mockGetReservationDeadlineSettings = mock(
  (): Promise<{
    cancellationDeadlineHours: number;
    modificationDeadlineHours: number;
  }> =>
    Promise.resolve({
      cancellationDeadlineHours: 24,
      modificationDeadlineHours: 48,
    }),
);

mock.module("@/shared/domain/settings/public-queries", () => ({
  getReservationDeadlineSettings: mockGetReservationDeadlineSettings,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

// エラーロギングモック
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  createErrorLogger: mock(() => mock(() => undefined)),
  safeFetch: mock(
    async <T>({
      fetch,
      fallback,
    }: {
      fetch: () => Promise<T>;
      fallback: T;
    }) => {
      try {
        return await fetch();
      } catch {
        return fallback;
      }
    },
  ),
  criticalFetch: mock(async <T>({ fetch }: { fetch: () => Promise<T> }) =>
    fetch(),
  ),
  normalizeError: mock((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ),
  getErrorMessage: mock((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  ReservationOverlapError: class ReservationOverlapError extends Error {
    constructor(message = "選択された時間帯は既に予約されています") {
      super(message);
      this.name = "ReservationOverlapError";
    }
  },
  isReservationOverlapError: mock(
    (error: unknown) =>
      error instanceof Error && error.name === "ReservationOverlapError",
  ),
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

// =============================================================================
// テストデータ
// =============================================================================

const VALID_RESERVATION_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_SPACE_ID = "550e8400-e29b-41d4-a716-446655440001";

type UpdateInputShape = {
  reservationId: string;
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  turnstileToken?: string;
  version: number;
};

const VALID_UPDATE_INPUT: UpdateInputShape = {
  reservationId: VALID_RESERVATION_ID,
  spaceId: VALID_SPACE_ID,
  date: "2099-12-31",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 5,
  version: 0,
};

function inputToFormData(input: UpdateInputShape): FormData {
  const fd = new FormData();
  fd.append("reservationId", input.reservationId);
  fd.append("spaceId", input.spaceId);
  fd.append("date", input.date);
  fd.append("startTime", input.startTime);
  fd.append("endTime", input.endTime);
  fd.append("numberOfGuests", String(input.numberOfGuests));
  fd.append("version", String(input.version));
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  return fd;
}

// =============================================================================
// テスト本体: cancelReservationAction (signature 維持 — RPC、button 由来)
// =============================================================================

describe("cancelReservationAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockCancelCustomerReservation.mockClear();
    mockGetReservationDeadlineSettings.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
    mockUpdateTag.mockClear();
    mockIsFeatureEnabled.mockClear();

    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({
        id: "customer-001",
        lastName: "山田",
        firstName: "太郎",
      }),
    );
    mockGetReservationDeadlineSettings.mockImplementation(() =>
      Promise.resolve({
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 48,
      }),
    );
    mockCancelCustomerReservation.mockImplementation(() =>
      Promise.resolve({
        success: true as const,
        payload: { reservationId: VALID_RESERVATION_ID },
      }),
    );
    mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(true));
  });

  describe("正常系", () => {
    test("有効な予約 ID でキャンセルが成功し null を返す", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expect(result).toBeNull();
    });

    test("キャンセル理由 null でもキャンセルが成功する", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID, null);

      expect(result).toBeNull();
    });

    test("キャンセル理由が空白のみの場合は null として渡される", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction(VALID_RESERVATION_ID, "   ");

      expect(mockCancelCustomerReservation).toHaveBeenCalledWith(
        VALID_RESERVATION_ID,
        "customer-001",
        24,
        null,
      );
    });

    test("キャンセル後に updateTag が呼ばれる", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction(VALID_RESERVATION_ID);

      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe("認証が必要です");
    });

    test("未認証時は cancelCustomerReservation が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction(VALID_RESERVATION_ID);

      expect(mockCancelCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時はエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe("リクエストが多すぎます");
    });
  });

  describe("異常系: 不正な予約 ID", () => {
    test("UUID 形式でない予約 ID のとき MutationError を返す", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction("not-a-uuid");

      expectErrorResult(result);
      expect(result.error).toBe("予約IDが不正です");
    });
  });

  describe("異常系: 顧客情報なし", () => {
    test("顧客が見つからないとき MutationError を返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe("顧客情報が見つかりません");
    });
  });

  describe("異常系: reservation feature OFF (Codex #1433)", () => {
    test("feature OFF のとき MutationError を返す", async () => {
      mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(false));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe(
        "この機能は現在利用できません。管理者にお問い合わせください。",
      );
    });

    test("feature OFF のとき cancelCustomerReservation は呼ばれない (閲覧専用ページから gate 済み action を直接叩かれても mutation は起きない)", async () => {
      mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(false));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction(VALID_RESERVATION_ID);

      expect(mockCancelCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: ドメインエラー", () => {
    test("cancelCustomerReservation が success: false を返したとき MutationError を返す", async () => {
      mockCancelCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "キャンセル期限を過ぎています",
        }),
      );

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe("キャンセル期限を過ぎています");
    });

    test("cancelCustomerReservation が DomainError をスローしたとき MutationError を返す", async () => {
      mockCancelCustomerReservation.mockImplementation(() =>
        Promise.reject(
          new DomainError("この予約はキャンセルできません", "UNAUTHORIZED"),
        ),
      );

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expectErrorResult(result);
      expect(result.error).toBe("この予約はキャンセルできません");
    });

    test("cancelCustomerReservation が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCancelCustomerReservation.mockImplementation(() =>
        Promise.reject(new Error("予期しない DB エラー")),
      );

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await expect(
        cancelReservationAction(VALID_RESERVATION_ID),
      ).rejects.toThrow("予期しない DB エラー");
    });
  });
});

// =============================================================================
// テスト本体: updateReservationAction (Phase 2 B-6 conform 化)
// =============================================================================

describe("updateReservationAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockUpdateCustomerReservation.mockClear();
    mockGetReservationDeadlineSettings.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
    mockUpdateTag.mockClear();
    mockCreateAuditLogRecord.mockClear();
    mockIsFeatureEnabled.mockClear();

    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({
        id: "customer-001",
        lastName: "山田",
        firstName: "太郎",
      }),
    );
    mockGetReservationDeadlineSettings.mockImplementation(() =>
      Promise.resolve({
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 48,
      }),
    );
    mockUpdateCustomerReservation.mockImplementation(() =>
      Promise.resolve({
        success: true as const,
        payload: {
          reservationId: VALID_RESERVATION_ID,
          googleCalendarEventId: null,
        },
      }),
    );
    mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(true));
    mockFetchReservationEmailData.mockClear();
    mockSyncReservationToCalendar.mockClear();
    mockUpdateCalendarSync.mockClear();
  });

  describe("正常系", () => {
    test("有効な入力で予約変更が成功する", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      // conform v1.19: `reply({ resetForm: true })` は `{ initialValue: null }`
      expect(result.initialValue).toBeNull();
      expect(result.status).not.toBe("error");
    });

    test("updateCustomerReservation が customer.id と deadlineHours を引数に呼ばれる", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockUpdateCustomerReservation).toHaveBeenCalledTimes(1);
      expect(mockUpdateCustomerReservation).toHaveBeenCalledWith(
        VALID_RESERVATION_ID,
        "customer-001",
        expect.objectContaining({ reservationId: VALID_RESERVATION_ID }),
        48,
      );
    });

    test("変更後に updateTag が複数のキャッシュタグに対して呼ばれる", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      // RESERVATIONS + reservations.detail + reservations.calendar = 3回以上
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき formErrors に認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("認証が必要です");
    });

    test("未認証時は updateCustomerReservation が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時は formErrors にエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("リクエストが多すぎます");
    });
  });

  describe("異常系: 顧客情報なし", () => {
    test("顧客が見つからないとき formErrors にエラーを返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("顧客情報が見つかりません");
    });
  });

  describe("異常系: reservation feature OFF (Codex #1433)", () => {
    test("feature OFF のとき formErrors にエラーを返し updateCustomerReservation は呼ばれない", async () => {
      mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(false));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("この機能は現在利用できません。");
      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("reservationId が UUID 形式でないとき fieldErrors を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, reservationId: "not-a-uuid" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["reservationId"]).toBeDefined();
    });

    test("spaceId が UUID 形式でないとき fieldErrors を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, spaceId: "not-a-uuid" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["spaceId"]).toBeDefined();
    });

    test("date が不正な形式のとき fieldErrors を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, date: "2025/08/01" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["date"]).toBeDefined();
    });

    test("startTime が不正な形式のとき fieldErrors を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, startTime: "10:00:00" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["startTime"]).toBeDefined();
    });

    test("endTime が startTime より前のとき refine エラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({
          ...VALID_UPDATE_INPUT,
          startTime: "14:00",
          endTime: "10:00",
        }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["endTime"]).toBeDefined();
    });

    test("numberOfGuests が 0 のとき fieldErrors を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, numberOfGuests: 0 }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["numberOfGuests"]).toBeDefined();
    });

    test("バリデーション失敗時は updateCustomerReservation が呼ばれない", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData({ ...VALID_UPDATE_INPUT, reservationId: "not-a-uuid" }),
      );

      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: ドメインエラー", () => {
    test("updateCustomerReservation が success: false を返したとき formErrors を返す", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "変更期限を過ぎています",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("変更期限を過ぎています");
    });

    test("updateCustomerReservation が DomainError をスローしたとき formErrors を返す", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.reject(
          new DomainError("選択された時間帯は既に予約されています", "CONFLICT"),
        ),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe(
        "選択された時間帯は既に予約されています",
      );
    });

    test("updateCustomerReservation が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.reject(new Error("予期しない DB エラー")),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await expect(
        updateReservationAction(undefined, inputToFormData(VALID_UPDATE_INPUT)),
      ).rejects.toThrow("予期しない DB エラー");
    });
  });

  // SEC-MYPAGE-01 / UPDATE-ORDER-01 / SEC-MYPAGE-03:
  // customer 経路にも AuditLog を残す + Turnstile 順序 SSoT 準拠を固定する。
  describe("Turnstile 順序 (UPDATE-ORDER-01 / SEC-MYPAGE-03)", () => {
    test("Turnstile 検証は session/customer 取得より前に走る", async () => {
      // Turnstile が fail した場合、session/customer は呼ばれない = order 証明。
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "Turnstile 検証に失敗しました",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("Turnstile 検証に失敗しました");
      expect(mockValidateTurnstile).toHaveBeenCalledTimes(1);
      // 順序 SSoT: Turnstile fail → session/customer は取得されない
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockGetCustomerByUserId).not.toHaveBeenCalled();
      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("AuditLog (SEC-MYPAGE-01)", () => {
    test("成功時に createAuditLogRecord が userId + resource='reservation' で呼ばれる", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const call = mockCreateAuditLogRecord.mock.calls[0]?.[0] ?? {};
      expect(call["userId"]).toBe("user-001");
      expect(call["action"]).toBe("UPDATE");
      expect(call["resource"]).toBe("reservation");
      expect(call["resourceId"]).toBe(VALID_RESERVATION_ID);
      expect(call["newValue"]).toBeDefined();
      expect(call["metadata"]).toBeDefined();
    });

    test("update が success:false を返すと AuditLog は書かれない", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "変更期限を過ぎています",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    });
  });

  // GCAL-OUTBOUND-01: 顧客セルフ変更でも管理画面 updateReservationAction と
  // 同型で GCal 同期を発火する (旧実装はこの経路だけ欠落していた)。
  describe("GCal 同期 (GCAL-OUTBOUND-01)", () => {
    test("成功時に fetchReservationEmailData が予約IDで呼ばれる (ReservationSyncData 組み立ての SSoT 再利用)", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockFetchReservationEmailData).toHaveBeenCalledWith(
        VALID_RESERVATION_ID,
      );
    });

    test("googleCalendarEventId が既存なら updateCalendarSync を呼ぶ (create ではない)", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: true as const,
          payload: {
            reservationId: VALID_RESERVATION_ID,
            googleCalendarEventId: "gcal-existing-001",
          },
        }),
      );
      mockFetchReservationEmailData.mockImplementation(() =>
        Promise.resolve({
          reservationId: VALID_RESERVATION_ID,
          customerEmail: "c@example.com",
          customerName: "山田 太郎",
          spaceName: "Space A",
          startTime: new Date("2099-12-31T10:00:00Z"),
          endTime: new Date("2099-12-31T12:00:00Z"),
          totalPrice: 1000,
          icsSequence: 0,
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      // fireAndForget 内の await fetchReservationEmailData 後の続きを待つ。
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockUpdateCalendarSync).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: VALID_RESERVATION_ID }),
        "gcal-existing-001",
      );
      expect(mockSyncReservationToCalendar).not.toHaveBeenCalled();
    });

    test("googleCalendarEventId が無ければ syncReservationToCalendar (create) を呼ぶ", async () => {
      mockFetchReservationEmailData.mockImplementation(() =>
        Promise.resolve({
          reservationId: VALID_RESERVATION_ID,
          customerEmail: "c@example.com",
          customerName: "山田 太郎",
          spaceName: "Space A",
          startTime: new Date("2099-12-31T10:00:00Z"),
          endTime: new Date("2099-12-31T12:00:00Z"),
          totalPrice: 1000,
          icsSequence: 0,
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSyncReservationToCalendar).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: VALID_RESERVATION_ID }),
      );
      expect(mockUpdateCalendarSync).not.toHaveBeenCalled();
    });

    test("update が success:false のとき GCal 同期は発火しない", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "変更期限を過ぎています",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(
        undefined,
        inputToFormData(VALID_UPDATE_INPUT),
      );

      expect(mockFetchReservationEmailData).not.toHaveBeenCalled();
      expect(mockSyncReservationToCalendar).not.toHaveBeenCalled();
      expect(mockUpdateCalendarSync).not.toHaveBeenCalled();
    });
  });

  describe("customerReservationEditSchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        reservationId: VALID_RESERVATION_ID,
        spaceId: VALID_SPACE_ID,
        date: "2099-12-31",
        startTime: "10:00",
        endTime: "12:00",
        numberOfGuests: 1,
        version: 0,
      });

      expect(result.success).toBe(true);
    });

    test("startTime === endTime のとき refine で失敗", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        startTime: "10:00",
        endTime: "10:00",
      });

      expect(result.success).toBe(false);
    });
  });
});
