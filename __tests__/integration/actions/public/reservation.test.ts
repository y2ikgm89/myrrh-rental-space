/**
 * 公開予約フォーム Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/reservation.ts のテスト
 *
 * モック方針:
 * - validateTurnstile: action-helpers をモック（常に成功を返す）
 * - verifySpaceBelongsToLocation: スペース所属確認を DB なしで成功に固定
 * - createPublicReservationCommand: domain コマンドをモック
 * - email 送信: email-service をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  validateTurnstile: mockValidateTurnstile,
  checkActionRateLimit: mockCheckActionRateLimit,
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

const mockCreatePublicReservationCommand = mock(() =>
  Promise.resolve({
    id: "reservation-001",
    payload: {
      reservationId: "reservation-001",
      customerEmail: "yamada@example.com",
      customerName: "山田 太郎",
      spaceName: "テストスペース",
      startTime: new Date("2025-06-01T10:00:00"),
      endTime: new Date("2025-06-01T12:00:00"),
      totalPrice: 10000,
      notes: undefined,
      location: "東京都渋谷区",
    },
  }),
);

mock.module("@/shared/domain/reservations/commands", () => ({
  createPublicReservationCommand: mockCreatePublicReservationCommand,
}));

/** DB を使わず、ロケーションとスペースの整合チェックを通過させる */
const mockVerifySpaceBelongsToLocation = mock(() => Promise.resolve(true));

mock.module("@/shared/domain/spaces/public-queries", () => ({
  verifySpaceBelongsToLocation: mockVerifySpaceBelongsToLocation,
}));

const mockSendReservationAdminNotification = mock(() => Promise.resolve());

mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationConfirmationEmail: mock(() => Promise.resolve()),
  sendReservationCancelledEmail: mock(() => Promise.resolve()),
  sendReservationStatusChangedEmail: mock(() => Promise.resolve()),
  sendReservationAdminNotification: mockSendReservationAdminNotification,
}));

const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
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

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: <T extends Record<string, unknown>>(obj: T): Partial<T> => {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  },
  toPlainObject: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)),
  toPlainArray: <T>(arr: T[]): T[] => JSON.parse(JSON.stringify(arr)),
  keysOf: <T extends object>(obj: T) => Object.keys(obj),
  entriesOf: <T extends object>(obj: T) => Object.entries(obj),
  filterTruthy: <T>(arr: readonly (T | false | null | undefined)[]): T[] =>
    arr.filter(Boolean) as T[],
  createTypeGuard:
    <T extends string>(values: readonly T[]) =>
    (value: unknown): value is T =>
      typeof value === "string" && new Set<string>(values).has(value),
  isRecord: (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value),
  toDateString: (date: Date) => date.toISOString().split("T")[0],
  dateInputValueFromSerialized: (v: string) => v.split("T")[0],
}));

const mockGetCurrentUser = mock(() => Promise.resolve(null));

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => Promise.resolve(null)),
  getCurrentCustomerUser: mockGetCurrentUser,
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
  customerAuth: {},
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

// server-only モック（テスト環境で server-only を無効化）
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_LOCATION_ID = "00000000-0000-4000-a000-000000000001";
const VALID_SPACE_ID = "550e8400-e29b-41d4-a716-446655440000";

const VALID_INPUT = {
  locationId: VALID_LOCATION_ID,
  spaceId: VALID_SPACE_ID,
  date: "2025-06-01",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 5,
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  notes: "",
  agreedTermsIds: [],
  turnstileToken: "test-token-valid",
};

// =============================================================================
// テスト本体
// =============================================================================

describe("submitReservation", () => {
  beforeEach(() => {
    mockValidateTurnstile.mockClear();
    mockCreatePublicReservationCommand.mockClear();
    mockVerifySpaceBelongsToLocation.mockClear();
    mockSendReservationAdminNotification.mockClear();
    mockUpdateTag.mockClear();
    // 成功レスポンスにリセット
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCreatePublicReservationCommand.mockImplementation(() =>
      Promise.resolve({
        id: "reservation-001",
        payload: {
          reservationId: "reservation-001",
          customerEmail: "yamada@example.com",
          customerName: "山田 太郎",
          spaceName: "テストスペース",
          startTime: new Date("2025-06-01T10:00:00"),
          endTime: new Date("2025-06-01T12:00:00"),
          totalPrice: 10000,
          notes: undefined,
          location: "東京都渋谷区",
        },
      }),
    );
    mockVerifySpaceBelongsToLocation.mockImplementation(() =>
      Promise.resolve(true),
    );
  });

  describe("正常系", () => {
    test("有効な入力で予約作成が成功し id を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(VALID_INPUT);

      expect(result).toEqual({ id: "reservation-001" });
    });

    test("createPublicReservationCommand がパース済みデータを引数に呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(VALID_INPUT);

      expect(mockCreatePublicReservationCommand).toHaveBeenCalledTimes(1);
    });

    test("updateTag が複数のキャッシュタグに対して呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(VALID_INPUT);

      // RESERVATIONS + reservations.calendar + CUSTOMERS + customers.detail = 4回以上
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    test("phoneNumber が省略されても成功する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const inputWithoutPhone = { ...VALID_INPUT, phoneNumber: undefined };
      const result = await submitReservation(inputWithoutPhone);

      expect(result).toEqual({ id: "reservation-001" });
    });

    test("notes が空文字列でも成功する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({ ...VALID_INPUT, notes: "" });

      expect(result).toEqual({ id: "reservation-001" });
    });

    test("turnstileToken が undefined でも Turnstile 検証が呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const inputWithoutToken = { ...VALID_INPUT, turnstileToken: undefined };
      await submitReservation(inputWithoutToken);

      expect(mockValidateTurnstile).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("spaceId が無効な UUID のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        spaceId: "not-a-uuid",
      });

      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("fieldErrors");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("spaceId");
    });

    test("date が不正な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        date: "2025/06/01",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("date");
    });

    test("startTime が不正な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
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
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
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
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        numberOfGuests: 0,
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("numberOfGuests");
    });

    test("numberOfGuests が 501 のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        numberOfGuests: 501,
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("numberOfGuests");
    });

    test("lastName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({ ...VALID_INPUT, lastName: "" });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("lastName");
    });

    test("firstName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        firstName: "",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("firstName");
    });

    test("email が無効な形式のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        email: "invalid-email",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("email");
    });

    test("agreedTermsIds に不正な UUID を含むとき fieldErrors を含むエラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation({
        ...VALID_INPUT,
        agreedTermsIds: ["not-a-uuid"],
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("agreedTermsIds");
    });

    test("バリデーション失敗時は createPublicReservationCommand が呼ばれない", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation({ ...VALID_INPUT, lastName: "" });

      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: Turnstile 検証失敗", () => {
    test("Turnstile 検証失敗時はエラーを返す", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toContain("セキュリティ検証");
    });

    test("Turnstile 失敗時は createPublicReservationCommand が呼ばれない", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "セキュリティ検証に失敗しました。",
        }),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(VALID_INPUT);

      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("DomainError（NOT_FOUND）をスローしたとき MutationError を返す", async () => {
      mockCreatePublicReservationCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("指定されたスペースが見つかりません", "NOT_FOUND"),
        ),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("指定されたスペースが見つかりません");
    });

    test("DomainError（CONFLICT）をスローしたとき MutationError を返す", async () => {
      mockCreatePublicReservationCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError(
            "選択された時間帯は既に予約されています。別の時間帯をお選びください。",
            "CONFLICT",
          ),
        ),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toContain("既に予約されています");
    });

    test("DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreatePublicReservationCommand.mockImplementation(() =>
        Promise.reject(new Error("DB 接続エラー")),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await expect(submitReservation(VALID_INPUT)).rejects.toThrow(
        "DB 接続エラー",
      );
    });
  });

  describe("publicReservationSchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        locationId: VALID_LOCATION_ID,
        spaceId: VALID_SPACE_ID,
        date: "2025-06-01",
        startTime: "10:00",
        endTime: "12:00",
        numberOfGuests: 1,
        lastName: "山田",
        firstName: "太郎",
        email: "yamada@example.com",
        agreedTermsIds: [],
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber は省略可能", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        locationId: VALID_LOCATION_ID,
        spaceId: VALID_SPACE_ID,
        date: "2025-06-01",
        startTime: "10:00",
        endTime: "12:00",
        numberOfGuests: 2,
        lastName: "田中",
        firstName: "花子",
        email: "tanaka@example.com",
        agreedTermsIds: [],
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber が空文字列でも通過", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        phoneNumber: "",
      });

      expect(result.success).toBe(true);
    });

    test("notes が空文字列でも通過", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        notes: "",
      });

      expect(result.success).toBe(true);
    });

    test("startTime === endTime のとき refine で失敗", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
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
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        numberOfGuests: 1,
      });

      expect(result.success).toBe(true);
    });

    test("numberOfGuests が 500 の境界値で通過", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        numberOfGuests: 500,
      });

      expect(result.success).toBe(true);
    });

    test("notes が 2000 文字で通過", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        notes: "あ".repeat(2000),
      });

      expect(result.success).toBe(true);
    });

    test("notes が 2001 文字で失敗", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const result = publicReservationSchema.safeParse({
        ...VALID_INPUT,
        notes: "あ".repeat(2001),
      });

      expect(result.success).toBe(false);
    });

    test("turnstileToken は省略可能", async () => {
      const { publicReservationSchema } =
        await import("@/shared/lib/validations/public-reservation");

      const { turnstileToken: _, ...inputWithoutToken } = VALID_INPUT;
      const result = publicReservationSchema.safeParse(inputWithoutToken);

      expect(result.success).toBe(true);
    });
  });
});
