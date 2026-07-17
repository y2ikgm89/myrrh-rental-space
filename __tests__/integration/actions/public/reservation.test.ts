/**
 * 公開予約フォーム Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/reservation.ts のテスト
 *
 * Phase 2 conform 移行後 (B-7):
 *   signature: `(_prev, formData) => SubmissionResult`
 *   - `executeConformMutation` SSoT 経由 (default `resetForm: true`)
 *   - success: `{ initialValue: null }` (form は submitted view に切替)
 *   - field-level error: `submission.reply()`
 *   - form-level error (rate limit / Turnstile / domain space-location mismatch
 *     / DomainError): `reply({ formErrors })`
 *
 * モック方針:
 * - validateTurnstile / checkActionRateLimit: action-helpers をモック
 * - verifySpaceBelongsToLocation: スペース所属確認を DB なしで成功に固定
 * - createPublicReservationCommand: domain コマンドをモック
 * - sendReservationAdminNotification: email-service をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectSubmissionLike } from "../../../helpers/type-assertions";
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

const mockCheckBotHeuristics = mock(
  (): { success: boolean; error?: string } => ({ success: true }),
);

const mockCheckEmailRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  validateTurnstile: mockValidateTurnstile,
  checkActionRateLimit: mockCheckActionRateLimit,
  checkBotHeuristics: mockCheckBotHeuristics,
  checkEmailRateLimit: mockCheckEmailRateLimit,
}));

const mockCreatePublicReservationCommand = mock(() =>
  Promise.resolve({
    id: "reservation-001",
    customerId: null,
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

mock.module("@/shared/domain/reservations/public-commands", () => ({
  createPublicReservationCommand: mockCreatePublicReservationCommand,
}));

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

// terms 系: server-side consent gate + 記録コマンドを no-op に。
const mockGetRequiredTermsByScope = mock(() => Promise.resolve([]));
const mockRecordTermsAgreementsCommand = mock(() =>
  Promise.resolve({ count: 0 }),
);
mock.module("@/shared/domain/terms/queries", () => ({
  getRequiredTermsByScope: mockGetRequiredTermsByScope,
}));
mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mockRecordTermsAgreementsCommand,
}));

const mockSyncReservationToCalendar = mock(() =>
  Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  syncReservationToCalendar: mockSyncReservationToCalendar,
}));

const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

mock.module("next/headers", () => ({
  headers: mock(() =>
    Promise.resolve(new Headers({ "x-forwarded-for": "127.0.0.1" })),
  ),
  cookies: mock(() =>
    Promise.resolve({ get: () => undefined, getAll: () => [] }),
  ),
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
  omitUndefined: (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  },
  toPlainObject: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)),
  toPlainArray: <T>(arr: T[]): T[] => JSON.parse(JSON.stringify(arr)),
  keysOf: <T extends object>(obj: T) => Object.keys(obj),
  entriesOf: <T extends object>(obj: T) => Object.entries(obj),
  filterTruthy: <T>(arr: readonly (T | false | null | undefined)[]): T[] => {
    const result: T[] = [];
    for (const item of arr) {
      if (item) {
        result.push(item);
      }
    }
    return result;
  },
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

// next/navigation redirect モック（本番では throw して以降を中断するが、テストでは
// no-op にして submitReservation の戻り値と redirect 先 URL を検証する）
const mockRedirect = mock((_url: string) => undefined);

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}));

// server-only モック
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_LOCATION_ID = "00000000-0000-4000-a000-000000000001";
const VALID_SPACE_ID = "550e8400-e29b-41d4-a716-446655440000";

type ReservationInputShape = {
  locationId: string;
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  customerType?: "PERSONAL" | "CORPORATE";
  companyName?: string;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string;
  notes?: string;
  turnstileToken?: string;
  agreedTermsIds?: readonly string[];
};

const VALID_INPUT: ReservationInputShape = {
  locationId: VALID_LOCATION_ID,
  spaceId: VALID_SPACE_ID,
  date: "2025-06-01",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 5,
  customerType: "PERSONAL",
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  notes: "",
  turnstileToken: "test-token-valid",
};

function inputToFormData(input: ReservationInputShape): FormData {
  const fd = new FormData();
  fd.append("locationId", input.locationId);
  fd.append("spaceId", input.spaceId);
  fd.append("date", input.date);
  fd.append("startTime", input.startTime);
  fd.append("endTime", input.endTime);
  fd.append("numberOfGuests", String(input.numberOfGuests));
  if (input.customerType !== undefined) {
    fd.append("customerType", input.customerType);
  }
  if (input.companyName !== undefined) {
    fd.append("companyName", input.companyName);
  }
  fd.append("lastName", input.lastName);
  fd.append("firstName", input.firstName);
  fd.append("email", input.email);
  if (input.phoneNumber !== undefined) {
    fd.append("phoneNumber", input.phoneNumber);
  }
  if (input.notes !== undefined) {
    fd.append("notes", input.notes);
  }
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  for (const id of input.agreedTermsIds ?? []) {
    fd.append("agreedTermsIds", id);
  }
  return fd;
}

// =============================================================================
// テスト本体
// =============================================================================

describe("submitReservation", () => {
  beforeEach(() => {
    mockValidateTurnstile.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockCheckBotHeuristics.mockClear();
    mockCheckEmailRateLimit.mockClear();
    mockCreatePublicReservationCommand.mockClear();
    mockVerifySpaceBelongsToLocation.mockClear();
    mockSendReservationAdminNotification.mockClear();
    mockSyncReservationToCalendar.mockClear();
    mockUpdateTag.mockClear();
    mockGetCurrentUser.mockClear();
    mockRedirect.mockClear();
    mockGetRequiredTermsByScope.mockClear();
    mockRecordTermsAgreementsCommand.mockClear();
    mockGetRequiredTermsByScope.mockImplementation(() => Promise.resolve([]));

    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCheckBotHeuristics.mockImplementation(() => ({
      success: true as const,
    }));
    mockCheckEmailRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockCreatePublicReservationCommand.mockImplementation(() =>
      Promise.resolve({
        id: "reservation-001",
        customerId: null,
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
    mockGetCurrentUser.mockImplementation(() => Promise.resolve(null));
  });

  describe("正常系", () => {
    test("有効な入力で予約作成が成功する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
      expect(result.status).not.toBe("error");
    });

    test("予約成功時に完了ページ (/reservation/complete) へ redirect する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const target = mockRedirect.mock.calls[0]?.[0];
      expect(target).toMatch(/^\/reservation\/complete/u);
    });

    test("createPublicReservationCommand がパース済みデータを引数に呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreatePublicReservationCommand).toHaveBeenCalledTimes(1);
    });

    test("予約作成成功時に syncReservationToCalendar が payload を引数に呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockSyncReservationToCalendar).toHaveBeenCalledTimes(1);
      expect(mockSyncReservationToCalendar).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: "reservation-001",
          spaceName: "テストスペース",
          customerEmail: "yamada@example.com",
        }),
      );
    });

    test("updateTag が複数のキャッシュタグに対して呼ばれる", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      // invalidateReservationCaches 経由で複数 tag invalidate
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test("phoneNumber が省略されても成功する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const { phoneNumber: _omit, ...inputWithoutPhone } = VALID_INPUT;
      const result = await submitReservation(
        undefined,
        inputToFormData(inputWithoutPhone),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
    });

    test("notes が空文字列でも成功する", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, notes: "" }),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("spaceId が無効な UUID のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, spaceId: "not-a-uuid" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["spaceId"]).toBeDefined();
    });

    test("date が不正な形式のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, date: "2025/06/01" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["date"]).toBeDefined();
    });

    test("startTime が不正な形式のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, startTime: "10:00:00" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["startTime"]).toBeDefined();
    });

    test("endTime が startTime より前のとき refine エラーを返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({
          ...VALID_INPUT,
          startTime: "14:00",
          endTime: "10:00",
        }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["endTime"]).toBeDefined();
    });

    test("numberOfGuests が 0 のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, numberOfGuests: 0 }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["numberOfGuests"]).toBeDefined();
    });

    test("numberOfGuests が 501 のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, numberOfGuests: 501 }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["numberOfGuests"]).toBeDefined();
    });

    test("lastName が空文字列のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["lastName"]).toBeDefined();
    });

    test("email が無効な形式のとき fieldErrors を返す", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, email: "invalid-email" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["email"]).toBeDefined();
    });

    test("バリデーション失敗時は createPublicReservationCommand が呼ばれない", async () => {
      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      );

      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: Turnstile 検証失敗", () => {
    test("Turnstile 検証失敗時は formErrors にエラーを返す", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("セキュリティ検証");
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

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 顧客(メール)単位レート制限", () => {
    test("メール単位の制限超過時は formErrors にエラーを返す", async () => {
      mockCheckEmailRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("リクエストが多すぎます");
      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });

    test("メール単位の制限はbot対策より前に実行される", async () => {
      mockCheckEmailRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます。",
        }),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockCheckBotHeuristics).not.toHaveBeenCalled();
    });
  });

  describe("異常系: bot対策(honeypot/timing)", () => {
    test("bot判定時は formErrors にエラーを返す", async () => {
      mockCheckBotHeuristics.mockImplementation(() => ({
        success: false as const,
        error:
          "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
      }));

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("セキュリティ検証");
    });

    test("bot判定時は createPublicReservationCommand が呼ばれない", async () => {
      mockCheckBotHeuristics.mockImplementation(() => ({
        success: false as const,
        error: "セキュリティ検証に失敗しました。",
      }));

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreatePublicReservationCommand).not.toHaveBeenCalled();
    });

    test("bot判定はTurnstile検証より前に実行される", async () => {
      mockCheckBotHeuristics.mockImplementation(() => ({
        success: false as const,
        error: "セキュリティ検証に失敗しました。",
      }));

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await submitReservation(undefined, inputToFormData(VALID_INPUT));

      expect(mockValidateTurnstile).not.toHaveBeenCalled();
    });
  });

  describe("異常系: スペース所属チェック失敗", () => {
    test("スペースがロケーションに属さないとき formErrors を返す", async () => {
      mockVerifySpaceBelongsToLocation.mockImplementation(() =>
        Promise.resolve(false),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toContain(
        "選択されたスペースは指定された場所",
      );
    });
  });

  describe("異常系: DomainError", () => {
    test("DomainError (NOT_FOUND) をスローしたとき formErrors を返す", async () => {
      mockCreatePublicReservationCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("指定されたスペースが見つかりません", "NOT_FOUND"),
        ),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe(
        "指定されたスペースが見つかりません",
      );
    });

    test("DomainError (CONFLICT) をスローしたとき formErrors を返す", async () => {
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

      const result = await submitReservation(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toContain("既に予約されています");
    });

    test("DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreatePublicReservationCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { submitReservation } =
        await import("@/app/(public)/_shared/actions/reservation");

      await expect(
        submitReservation(undefined, inputToFormData(VALID_INPUT)),
      ).rejects.toThrow("予期しないDBエラー");
    });
  });
});
