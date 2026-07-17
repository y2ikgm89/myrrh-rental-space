/**
 * マイページ 定期予約キャンセル Server Action 統合テスト (Phase B.2.1 Task A)。
 *
 * src/app/(public)/mypage/_shared/actions/reservation-series.ts のテスト対象:
 *   - cancelReservationSeriesCustomerAction: 顧客セルフの series-all キャンセル
 *
 * 検証する挙動:
 *   1. rate limit fail → MutationError (Turnstile 検証前で reject)
 *   2. Turnstile fail → MutationError
 *   3. seriesId が uuid でない → MutationError
 *   4. 認証なし → MutationError
 *   5. customer 未登録 → MutationError
 *   6. Settings.customerCanCancelSeriesInFull=false → MutationError (Settings gate)
 *   7. cancelCustomerReservationSeries が失敗 → MutationError (domain 側の
 *      not-found / ownership 不一致もここで吸収される)
 *   8. success → { cancelledCount } を返し invalidateReservationCaches が呼ばれる
 *   9. domain 側呼出しに `channel: "customer-mypage"` を含む input が渡る
 *      (cancelCustomerReservationSeries の argument capture)
 *
 * モック方針: `mypage-reservation.test.ts` と同型で domain command / auth /
 * rate limit / Turnstile / cache invalidation を差し替え、action 層の
 * gate 判定・エラー変換・成功時の cache 呼出を検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

const mockUpdateTag = mock(() => undefined);
mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

const mockCheckActionRateLimit = mock<
  () => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));

const mockValidateTurnstile = mock<
  () => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mockValidateTurnstile,
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

const mockGetSession = mock<() => Promise<{ user: { id: string } } | null>>(
  () => Promise.resolve({ user: { id: "user-001" } }),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  customerAuth: { api: {} },
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
}));

const mockGetCustomerByUserId = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "customer-001" }),
);

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

const mockCancelSeries = mock<
  (
    seriesId: string,
    customerId: string,
    cancellationReason: string | null,
    request: { ip: string | null; userAgent: string | null },
  ) => Promise<
    | { success: true; payload: { cancelledCount: number } }
    | { success: false; error: string }
  >
>((_seriesId, _customerId, _reason, _request) =>
  Promise.resolve({ success: true, payload: { cancelledCount: 3 } }),
);

// mock.module は module 全体を差し替えるため、customer-commands の他 export
// (cancelCustomerReservation / updateCustomerReservation / cancelReservationByToken) も
// stub を含めて無害化する (本 file では未使用)。
mock.module("@/shared/domain/reservations/customer-commands", () => ({
  cancelCustomerReservationSeries: mockCancelSeries,
  cancelCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used in series test" }),
  ),
  updateCustomerReservation: mock(() =>
    Promise.resolve({ success: false, error: "not used in series test" }),
  ),
  cancelReservationByToken: mock(() =>
    Promise.resolve({ success: false, error: "not used in series test" }),
  ),
}));

const mockGetCustomerCanCancelSeriesInFull = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

// payloads.ts は他 export を持つが、本 file で必要なのは gate 関数のみ。
// module 全体差替になるため、他 export を stub で埋める必要がある場合は追加する
// (現状 test 対象 action は getCustomerCanCancelSeriesInFull のみ import)。
mock.module("@/shared/domain/reservations/payloads", () => ({
  getCustomerCanCancelSeriesInFull: mockGetCustomerCanCancelSeriesInFull,
}));

const mockInvalidateReservationCaches = mock(() => undefined);
mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: mockInvalidateReservationCaches,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
}));

// =============================================================================
// SUT を動的 import
// =============================================================================

let cancelReservationSeriesCustomerAction: (
  seriesId: string,
  cancellationReason?: string | null,
  turnstileToken?: string,
) => Promise<MutationResult<{ cancelledCount: number }>>;

const VALID_SERIES_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(async () => {
  mockCheckActionRateLimit.mockClear();
  mockCheckActionRateLimit.mockImplementation(() =>
    Promise.resolve({ success: true }),
  );
  mockValidateTurnstile.mockClear();
  mockValidateTurnstile.mockImplementation(() =>
    Promise.resolve({ success: true }),
  );
  mockGetSession.mockClear();
  mockGetSession.mockImplementation(() =>
    Promise.resolve({ user: { id: "user-001" } }),
  );
  mockGetCustomerByUserId.mockClear();
  mockGetCustomerByUserId.mockImplementation(() =>
    Promise.resolve({ id: "customer-001" }),
  );
  mockGetCustomerCanCancelSeriesInFull.mockClear();
  mockGetCustomerCanCancelSeriesInFull.mockImplementation(() =>
    Promise.resolve(true),
  );
  mockCancelSeries.mockClear();
  mockCancelSeries.mockImplementation(() =>
    Promise.resolve({ success: true, payload: { cancelledCount: 3 } }),
  );
  mockInvalidateReservationCaches.mockClear();
  const module =
    await import("@/app/(public)/mypage/_shared/actions/reservation-series");
  cancelReservationSeriesCustomerAction =
    module.cancelReservationSeriesCustomerAction as typeof cancelReservationSeriesCustomerAction;
});

describe("cancelReservationSeriesCustomerAction (Phase B.2.1 Task A)", () => {
  test("rate limit fail → MutationError で Turnstile 検証まで到達しない", async () => {
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: false, error: "too many" }),
    );
    const result = await cancelReservationSeriesCustomerAction(VALID_SERIES_ID);
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) expect(result.error).toContain("多すぎ");
    expect(mockValidateTurnstile).not.toHaveBeenCalled();
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("Turnstile fail → MutationError", async () => {
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: false, error: "invalid captcha" }),
    );
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("seriesId が uuid でない → MutationError", async () => {
    const result = await cancelReservationSeriesCustomerAction(
      "not-a-uuid",
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) expect(result.error).toMatch(/series id/u);
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("認証なし (getCustomerSession null) → MutationError", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null));
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) expect(result.error).toMatch(/認証/u);
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("customer 未登録 (getCustomerByUserId null) → MutationError", async () => {
    mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) expect(result.error).toMatch(/顧客情報/u);
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("Settings.customerCanCancelSeriesInFull=false → MutationError (Settings gate、fail-closed)", async () => {
    mockGetCustomerCanCancelSeriesInFull.mockImplementation(() =>
      Promise.resolve(false),
    );
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result))
      expect(result.error).toMatch(/この機能|管理者/u);
    expect(mockCancelSeries).not.toHaveBeenCalled();
  });

  test("cancelCustomerReservationSeries が failure → MutationError (domain の not-found / ownership 不一致を伝播)", async () => {
    mockCancelSeries.mockImplementation(() =>
      Promise.resolve({ success: false, error: "定期予約が見つかりません" }),
    );
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      null,
      "token",
    );
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result))
      expect(result.error).toBe("定期予約が見つかりません");
    expect(mockInvalidateReservationCaches).not.toHaveBeenCalled();
  });

  test("success: cancelledCount 返却 + invalidateReservationCaches 呼出", async () => {
    const result = await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      "都合により",
      "token",
    );
    expect(isMutationError(result)).toBe(false);
    if (!isMutationError(result)) expect(result.cancelledCount).toBe(3);
    expect(mockCancelSeries).toHaveBeenCalledTimes(1);
    expect(mockInvalidateReservationCaches).toHaveBeenCalledTimes(1);
    expect(mockInvalidateReservationCaches).toHaveBeenCalledWith(
      VALID_SERIES_ID,
      "customer-001",
      { coupons: true },
    );
  });

  test("domain 呼出しに (seriesId, customerId, cancellationReason, request) が渡る (channel は domain 側で 'customer-mypage' 固定)", async () => {
    await cancelReservationSeriesCustomerAction(
      VALID_SERIES_ID,
      "都合により",
      "token",
    );
    expect(mockCancelSeries).toHaveBeenCalledTimes(1);
    const [seriesId, customerId, reason, request] =
      mockCancelSeries.mock.calls[0] ?? [];
    expect(seriesId).toBe(VALID_SERIES_ID);
    expect(customerId).toBe("customer-001");
    expect(reason).toBe("都合により");
    expect(request).toMatchObject({
      ip: "127.0.0.1",
      userAgent: null,
    });
  });

  test("cancellationReason が null / undefined でも success (任意入力)", async () => {
    await cancelReservationSeriesCustomerAction(VALID_SERIES_ID, null, "token");
    expect(mockCancelSeries).toHaveBeenCalledTimes(1);
    const call = mockCancelSeries.mock.calls[0];
    if (!call) throw new Error("mockCancelSeries call missing");
    expect(call[2]).toBeNull();
  });
});
