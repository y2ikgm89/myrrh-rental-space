/**
 * マイページ 予約 Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/reservation.ts のテスト
 *
 * テスト対象:
 * - cancelReservationAction: 予約キャンセル
 * - updateReservationAction: 予約変更
 *
 * モック方針:
 * - getSession: auth をモック（認証状態を制御）
 * - getCustomerByUserId: domain クエリをモック
 * - cancelCustomerReservation / updateCustomerReservation: domain コマンドをモック
 * - getReservationDeadlineSettings: domain 設定クエリをモック
 * - checkActionRateLimit: action-helpers をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
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

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  publicQueryRateLimiter: {},
}));

// auth モック
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);

mock.module("@/shared/lib/auth", () => ({
  getSession: mockGetSession,
  auth: { api: {} },
  getCurrentUser: mock(() => Promise.resolve(null)),
  verifySession: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  isAdmin: mock(() => Promise.resolve(false)),
  getSessionUser: () => null,
  getRoleFromSession: () => null,
  isValidRole: () => false,
}));

// domain クエリモック
const mockGetCustomerByUserId = mock(
  (): Promise<{ id: string; lastName: string } | null> =>
    Promise.resolve({ id: "customer-001", lastName: "山田" }),
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

// @/shared/lib/constants はモック不要（純粋な定数ファイル、副作用なし）

// エラーロギングモック
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
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

const VALID_UPDATE_INPUT = {
  reservationId: VALID_RESERVATION_ID,
  spaceId: VALID_SPACE_ID,
  date: "2025-08-01",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 5,
};

// =============================================================================
// テスト本体: cancelReservationAction
// =============================================================================

describe("cancelReservationAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockCancelCustomerReservation.mockClear();
    mockGetReservationDeadlineSettings.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockUpdateTag.mockClear();

    // デフォルト: 認証済み + 顧客あり + キャンセル成功
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({ id: "customer-001", lastName: "山田" }),
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

    test("cancelCustomerReservation が customer.id と deadlineHours を引数に呼ばれる", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction(
        VALID_RESERVATION_ID,
        "都合が悪くなりました",
      );

      expect(mockCancelCustomerReservation).toHaveBeenCalledTimes(1);
      expect(mockCancelCustomerReservation).toHaveBeenCalledWith(
        VALID_RESERVATION_ID,
        "customer-001",
        24,
        "都合が悪くなりました",
      );
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("認証が必要です");
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

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("リクエストが多すぎます");
    });
  });

  describe("異常系: 不正な予約 ID", () => {
    test("UUID 形式でない予約 ID のとき MutationError を返す", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction("not-a-uuid");

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("予約IDが不正です");
    });

    test("不正な予約 ID のとき cancelCustomerReservation が呼ばれない", async () => {
      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await cancelReservationAction("invalid-id");

      expect(mockCancelCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 顧客情報なし", () => {
    test("顧客が見つからないとき MutationError を返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { cancelReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await cancelReservationAction(VALID_RESERVATION_ID);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("顧客情報が見つかりません");
    });

    test("顧客が見つからないとき cancelCustomerReservation が呼ばれない", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

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

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("キャンセル期限を過ぎています");
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

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("この予約はキャンセルできません");
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
// テスト本体: updateReservationAction
// =============================================================================

describe("updateReservationAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockUpdateCustomerReservation.mockClear();
    mockGetReservationDeadlineSettings.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockUpdateTag.mockClear();

    // デフォルト: 認証済み + 顧客あり + 更新成功
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({ id: "customer-001", lastName: "山田" }),
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
    test("有効な入力で予約変更が成功し null を返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toBeNull();
    });

    test("updateCustomerReservation が customer.id と deadlineHours を引数に呼ばれる", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(VALID_UPDATE_INPUT);

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

      await updateReservationAction(VALID_UPDATE_INPUT);

      // RESERVATIONS + reservations.detail + reservations.calendar = 3回以上
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("認証が必要です");
    });

    test("未認証時は updateCustomerReservation が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(VALID_UPDATE_INPUT);

      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
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

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("リクエストが多すぎます");
    });
  });

  describe("異常系: 顧客情報なし", () => {
    test("顧客が見つからないとき MutationError を返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("顧客情報が見つかりません");
    });

    test("顧客が見つからないとき updateCustomerReservation が呼ばれない", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction(VALID_UPDATE_INPUT);

      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("reservationId が UUID 形式でないとき fieldErrors を含むエラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        reservationId: "not-a-uuid",
      });

      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("fieldErrors");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("reservationId");
    });

    test("spaceId が UUID 形式でないとき fieldErrors を含むエラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        spaceId: "not-a-uuid",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("spaceId");
    });

    test("date が不正な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        date: "2025/08/01",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("date");
    });

    test("startTime が不正な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        startTime: "10:00:00",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("startTime");
    });

    test("endTime が startTime より前のとき refine エラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        startTime: "14:00",
        endTime: "10:00",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("endTime");
    });

    test("numberOfGuests が 0 のとき fieldErrors を含むエラーを返す", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        numberOfGuests: 0,
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("numberOfGuests");
    });

    test("バリデーション失敗時は updateCustomerReservation が呼ばれない", async () => {
      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await updateReservationAction({
        ...VALID_UPDATE_INPUT,
        reservationId: "not-a-uuid",
      });

      expect(mockUpdateCustomerReservation).not.toHaveBeenCalled();
    });
  });

  describe("異常系: ドメインエラー", () => {
    test("updateCustomerReservation が success: false を返したとき MutationError を返す", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "変更期限を過ぎています",
        }),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("変更期限を過ぎています");
    });

    test("updateCustomerReservation が DomainError をスローしたとき MutationError を返す", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.reject(
          new DomainError("選択された時間帯は既に予約されています", "CONFLICT"),
        ),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      const result = await updateReservationAction(VALID_UPDATE_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("選択された時間帯は既に予約されています");
    });

    test("updateCustomerReservation が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockUpdateCustomerReservation.mockImplementation(() =>
        Promise.reject(new Error("予期しない DB エラー")),
      );

      const { updateReservationAction } =
        await import("@/app/(public)/mypage/_shared/actions/reservation");

      await expect(updateReservationAction(VALID_UPDATE_INPUT)).rejects.toThrow(
        "予期しない DB エラー",
      );
    });
  });

  describe("customerReservationEditSchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        reservationId: VALID_RESERVATION_ID,
        spaceId: VALID_SPACE_ID,
        date: "2025-08-01",
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
      if (!result.success) {
        const endTimeError = result.error.issues.find(
          (issue) => issue.path[0] === "endTime",
        );
        expect(endTimeError).toBeDefined();
      }
    });

    test("numberOfGuests が 1 の境界値で通過", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        numberOfGuests: 1,
      });

      expect(result.success).toBe(true);
    });

    test("reservationId が UUID でない場合に失敗", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        reservationId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    test("date が YYYY/MM/DD 形式（スラッシュ区切り）で失敗", async () => {
      const { customerReservationEditSchema } =
        await import("@/shared/lib/validations/customer-reservation");

      const result = customerReservationEditSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        date: "2025/08/01",
      });

      expect(result.success).toBe(false);
    });
  });
});
