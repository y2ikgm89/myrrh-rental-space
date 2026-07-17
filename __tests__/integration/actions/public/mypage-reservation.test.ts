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
 * - checkActionRateLimit / validateTurnstile: action-helpers をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  expectSubmissionLike,
  expectErrorResult,
} from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

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
const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
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

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mockValidateTurnstile,
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
// （実体は send.ts → customers/queries.ts の getSuppressedEmailSet まで連鎖するため）
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationAdminNotification: mock(() =>
    Promise.resolve({ ok: true, messageId: "msg_test" }),
  ),
  sendReservationUpdatedEmail: mock(() =>
    Promise.resolve({ ok: true, messageId: "msg_test" }),
  ),
  // Phase B.2 task 12 で追加された bulk 系 export。mock.module の
  // process-global live binding が他 test file の実 import に干渉して
  // SyntaxError を起こすため必須 ([[feedback_stale-branch-name-reuse-and-mock-module-coverage]])。
  sendBulkReservationCancelledEmail: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
  sendBulkAdminNotification: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
}));

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

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
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
};

const VALID_UPDATE_INPUT: UpdateInputShape = {
  reservationId: VALID_RESERVATION_ID,
  spaceId: VALID_SPACE_ID,
  date: "2099-12-31",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 5,
};

function inputToFormData(input: UpdateInputShape): FormData {
  const fd = new FormData();
  fd.append("reservationId", input.reservationId);
  fd.append("spaceId", input.spaceId);
  fd.append("date", input.date);
  fd.append("startTime", input.startTime);
  fd.append("endTime", input.endTime);
  fd.append("numberOfGuests", String(input.numberOfGuests));
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
        payload: { reservationId: VALID_RESERVATION_ID },
      }),
    );
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
