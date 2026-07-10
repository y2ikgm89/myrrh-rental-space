/**
 * マイページ イベント申込キャンセル Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/event-registration.ts の cancelEventRegistration テスト
 *
 * マイページ予約キャンセル（mypage-reservation.test.ts）と対称: 認証済み顧客の
 * 破壊的操作にも Turnstile 検証を要求する（#898 系列で追加されたゲストキャンセルの
 * bot 対策と保護レベルを揃える）。
 *
 * モック方針は mypage-reservation.test.ts / guest-event-registration-cancel.test.ts と同型。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectErrorResult } from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

const mockUpdateTag = mock(() => undefined);
mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

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
  // cancelEventRegistration は使わないが、同一ファイルの registerForEvent が
  // import するため、モジュール解決を通すために固定成功スタブを提供する。
  checkBotHeuristics: () => ({ success: true as const }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

const mockCancelEventRegistrationCommand = mock<
  () => Promise<{
    id: string;
    eventId: string;
    name: string;
    email: string;
    quantity: number;
    status: string;
    event: { title: string; slug: string };
  }>
>(() =>
  Promise.resolve({
    id: "reg-001",
    eventId: "evt-001",
    name: "山田太郎",
    email: "guest@example.com",
    quantity: 2,
    status: "CANCELLED",
    event: { title: "夏祭り", slug: "summer-fes" },
  }),
);
mock.module("@/shared/domain/events/registration-commands", () => ({
  cancelEventRegistrationCommand: mockCancelEventRegistrationCommand,
  createEventRegistrationCommand: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
}));

const mockApplySideEffects = mock(() => Promise.resolve());
mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mockApplySideEffects,
  }),
);

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationConfirmation: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
  sendEventAdminNotification: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(() => Promise.resolve()),
}));

const mockGetCustomerSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

const mockGetCustomerByUserId = mock((): Promise<{ id: string } | null> =>
  Promise.resolve({ id: "customer-001" }),
);
mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
}));

mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
}));

mock.module("@/shared/lib/terms-consent-gate", () => ({
  assertAllRequiredTermsAgreed: mock(() =>
    Promise.reject(new Error("not used in cancel test")),
  ),
}));

// =============================================================================
// テストデータ
// =============================================================================

// EventRegistration.id は Prisma cuid（@db.VarChar(30)）であり UUID ではない
// （prisma/schema.prisma の EventRegistration モデル参照）
const VALID_REGISTRATION_ID = "cm60x9k3p0000qzrm8f3a1b2c";
const IMPORT_PATH = "@/app/(public)/_shared/actions/event-registration";

// =============================================================================
// テスト本体: cancelEventRegistration
// =============================================================================

describe("cancelEventRegistration", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
    mockGetCustomerSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockCancelEventRegistrationCommand.mockClear();
    mockApplySideEffects.mockClear();
    mockUpdateTag.mockClear();

    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetCustomerSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "user-001", name: "テストユーザー" } }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({ id: "customer-001" }),
    );
    mockCancelEventRegistrationCommand.mockImplementation(() =>
      Promise.resolve({
        id: VALID_REGISTRATION_ID,
        eventId: "evt-001",
        name: "山田太郎",
        email: "guest@example.com",
        quantity: 2,
        status: "CANCELLED",
        event: { title: "夏祭り", slug: "summer-fes" },
      }),
    );
    mockApplySideEffects.mockImplementation(() => Promise.resolve());
  });

  describe("正常系", () => {
    test("有効な申込 ID でキャンセルが成功し null を返す", async () => {
      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "turnstile-token",
      );

      expect(result).toBeNull();
    });

    test("channel: customer-mypage で副作用が呼ばれる", async () => {
      const { cancelEventRegistration } = await import(IMPORT_PATH);

      await cancelEventRegistration(VALID_REGISTRATION_ID, "turnstile-token");

      expect(mockApplySideEffects).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationId: VALID_REGISTRATION_ID,
          channel: "customer-mypage",
        }),
      );
    });

    test("キャンセル後に updateTag が呼ばれる", async () => {
      const { cancelEventRegistration } = await import(IMPORT_PATH);

      await cancelEventRegistration(VALID_REGISTRATION_ID, "turnstile-token");

      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("異常系: Turnstile", () => {
    test("Turnstile 検証に失敗したときエラーを返しキャンセルを実行しない", async () => {
      mockValidateTurnstile.mockImplementation(() =>
        Promise.resolve({ success: false, error: "認証に失敗しました" }),
      );

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "bad-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("認証に失敗しました");
      expect(mockCancelEventRegistrationCommand).not.toHaveBeenCalled();
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

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "turnstile-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("リクエストが多すぎます");
      expect(mockValidateTurnstile).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 不正な申込 ID", () => {
    test("cuid 形式でない申込 ID のとき MutationError を返す", async () => {
      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        "550e8400-e29b-41d4-a716-446655440000",
        "turnstile-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("申込IDが不正です");
    });

    test("空文字の申込 ID のとき MutationError を返す", async () => {
      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration("", "turnstile-token");

      expectErrorResult(result);
      expect(result.error).toBe("申込IDが不正です");
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetCustomerSession.mockImplementation(() => Promise.resolve(null));

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "turnstile-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("認証が必要です");
    });
  });

  describe("異常系: 顧客情報なし", () => {
    test("顧客が見つからないとき MutationError を返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "turnstile-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("顧客情報が見つかりません");
    });
  });

  describe("異常系: ドメインエラー", () => {
    test("cancelEventRegistrationCommand が DomainError をスローしたとき MutationError を返す", async () => {
      mockCancelEventRegistrationCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("この申込はキャンセルできません", "CONFLICT"),
        ),
      );

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      const result = await cancelEventRegistration(
        VALID_REGISTRATION_ID,
        "turnstile-token",
      );

      expectErrorResult(result);
      expect(result.error).toBe("この申込はキャンセルできません");
    });

    test("cancelEventRegistrationCommand が DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCancelEventRegistrationCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しない DB エラー")),
      );

      const { cancelEventRegistration } = await import(IMPORT_PATH);

      await expect(
        cancelEventRegistration(VALID_REGISTRATION_ID, "turnstile-token"),
      ).rejects.toThrow("予期しない DB エラー");
    });
  });
});
