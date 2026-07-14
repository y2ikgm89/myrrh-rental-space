/**
 * 公開イベント申込フォーム Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/event-registration.ts の registerForEvent のテスト。
 * 焦点は bot対策(checkBotHeuristics)の統合であり、正常系1件で他の既存挙動が
 * regression していないことを最低限確認する。
 *
 * モック方針: reservation.test.ts と同型（action-helpers / domain command /
 * email / terms / notifications をモックし、registerForEvent 単体をテストする）。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectSubmissionLike } from "../../../helpers/type-assertions";

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

const mockCreateEventRegistrationCommand = mock(() =>
  Promise.resolve({
    registration: {
      id: "reg-001",
      eventId: "event-001",
      name: "山田 太郎",
      email: "yamada@example.com",
      quantity: 1,
      icsSequence: 0,
    },
    event: { title: "テストイベント", slug: "test-event" },
  }),
);

mock.module("@/shared/domain/events/registration-commands", () => ({
  createEventRegistrationCommand: mockCreateEventRegistrationCommand,
  cancelEventRegistrationCommand: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationConfirmation: mock(() => Promise.resolve()),
  sendEventAdminNotification: mock(() => Promise.resolve()),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(() =>
      Promise.resolve(),
    ),
  }),
);

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

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

// registerForEventWaitlist（同一ファイル内の別 Server Action）が使う top-level
// import 群。registerForEvent 自体は使わないが、ESM はファイル全体を即座に
// 評価するため mock しないと実体モジュールが読み込まれる（event-waitlist-emails.ts
// は footer-data.ts 経由で terms/queries.getFooterTerms を参照し、上の部分的な
// terms/queries mock と衝突して失敗する）。
mock.module("@/shared/domain/events/waitlist-commands", () => ({
  registerWaitlistEntryCommand: mock(() => Promise.resolve(null)),
}));

mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistRegistered: mock(() =>
    Promise.resolve({ ok: true as const }),
  ),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
  invalidateSiteWideCacheFromRouteHandler: mock(() => undefined),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
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

mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

type EventRegistrationInputShape = {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string;
  phone?: string;
  note?: string;
  quantity?: number;
  turnstileToken?: string;
};

const VALID_INPUT: EventRegistrationInputShape = {
  eventId: "cku8z9v0u0000qzrmn831i7rn",
  slotId: "cku8z9v0u0000qzrmn831i7rs",
  ticketId: "cku8z9v0u0000qzrmn831i7rt",
  name: "山田 太郎",
  email: "yamada@example.com",
  quantity: 1,
  turnstileToken: "test-token-valid",
};

function inputToFormData(input: EventRegistrationInputShape): FormData {
  const fd = new FormData();
  fd.append("eventId", input.eventId);
  fd.append("slotId", input.slotId);
  fd.append("ticketId", input.ticketId);
  fd.append("name", input.name);
  fd.append("email", input.email);
  if (input.phone !== undefined) fd.append("phone", input.phone);
  if (input.note !== undefined) fd.append("note", input.note);
  fd.append("quantity", String(input.quantity ?? 1));
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  return fd;
}

// =============================================================================
// テスト本体
// =============================================================================

describe("registerForEvent", () => {
  beforeEach(() => {
    mockValidateTurnstile.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockCheckBotHeuristics.mockClear();
    mockCheckEmailRateLimit.mockClear();
    mockCreateEventRegistrationCommand.mockClear();
    mockGetRequiredTermsByScope.mockClear();
    mockRecordTermsAgreementsCommand.mockClear();

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
    mockGetRequiredTermsByScope.mockImplementation(() => Promise.resolve([]));
    mockCreateEventRegistrationCommand.mockImplementation(() =>
      Promise.resolve({
        registration: {
          id: "reg-001",
          eventId: "event-001",
          name: "山田 太郎",
          email: "yamada@example.com",
          quantity: 1,
          icsSequence: 0,
        },
        event: { title: "テストイベント", slug: "test-event" },
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力で申込作成が成功する", async () => {
      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      const result = await registerForEvent(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      // 成功時は resetForm: true → { initialValue: null }（status フィールドなし）
      expect(result.initialValue).toBeNull();
      expect(mockCreateEventRegistrationCommand).toHaveBeenCalledTimes(1);
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

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      const result = await registerForEvent(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("リクエストが多すぎます");
      expect(mockCreateEventRegistrationCommand).not.toHaveBeenCalled();
    });

    test("メール単位の制限はbot対策より前に実行される", async () => {
      mockCheckEmailRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます。",
        }),
      );

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      await registerForEvent(undefined, inputToFormData(VALID_INPUT));

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

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      const result = await registerForEvent(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      const formErrors = result.error?.[""];
      expect(formErrors?.[0]).toContain("セキュリティ検証");
    });

    test("bot判定時は createEventRegistrationCommand が呼ばれない", async () => {
      mockCheckBotHeuristics.mockImplementation(() => ({
        success: false as const,
        error: "セキュリティ検証に失敗しました。",
      }));

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      await registerForEvent(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateEventRegistrationCommand).not.toHaveBeenCalled();
    });

    test("bot判定はTurnstile検証より前に実行される", async () => {
      mockCheckBotHeuristics.mockImplementation(() => ({
        success: false as const,
        error: "セキュリティ検証に失敗しました。",
      }));

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      await registerForEvent(undefined, inputToFormData(VALID_INPUT));

      expect(mockValidateTurnstile).not.toHaveBeenCalled();
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

      const { registerForEvent } =
        await import("@/app/(public)/_shared/actions/event-registration");

      const result = await registerForEvent(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(mockCreateEventRegistrationCommand).not.toHaveBeenCalled();
    });
  });
});
