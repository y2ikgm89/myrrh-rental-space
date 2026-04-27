/**
 * Event 一括操作 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts のテスト
 *
 * モック方針:
 * - executeAdminMutationResult: @/admin/lib/admin-action をモック（認証バイパス + actor 注入）
 * - bulkPublishEventsCommand / bulkSoftDeleteEventsCommand: domain コマンドをモック
 * - createValidationMutationError: action-helpers をモック
 * - invalidateEventCaches: cache helper をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/action-helpers", () => ({
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
  checkActionRateLimit: mock(() => Promise.resolve({ success: true })),
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
}));

const MOCK_ADMIN_USER = { id: "admin-user-001", email: "admin@example.com" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mock(
    async (opts: {
      execute: (user: typeof MOCK_ADMIN_USER) => Promise<unknown>;
      afterSuccess?: (data: unknown) => void;
    }) => {
      try {
        const data = await opts.execute(MOCK_ADMIN_USER);
        if (opts.afterSuccess) {
          opts.afterSuccess(data);
        }
        return { data };
      } catch (err) {
        if (err instanceof DomainError) {
          return { error: err.message };
        }
        throw err;
      }
    },
  ),
}));

const mockBulkPublishEventsCommand = mock<
  (ids: string[], publish: boolean) => Promise<unknown>
>(() =>
  Promise.resolve({
    count: 0,
    skipped: 0,
    isPublished: true,
    affectedSlugs: [],
    affectedTargets: [],
  }),
);

const mockBulkSoftDeleteEventsCommand = mock<
  (ids: string[], actor: { id: string }) => Promise<unknown>
>(() =>
  Promise.resolve({
    count: 0,
    affectedSlugs: [],
    affectedTargets: [],
  }),
);

mock.module("@/shared/domain/events/bulk-commands", () => ({
  bulkPublishEventsCommand: mockBulkPublishEventsCommand,
  bulkSoftDeleteEventsCommand: mockBulkSoftDeleteEventsCommand,
}));

const mockInvalidateEventCaches = mock(() => undefined);

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mockInvalidateEventCaches,
}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";

const INVALID_UUIDS = [
  "",
  "invalid",
  "not-a-uuid",
  "11111111-1111-4111-8111", // 短すぎる
];

// =============================================================================
// テスト本体
// =============================================================================

describe("bulkPublishEvents", () => {
  beforeEach(() => {
    mockBulkPublishEventsCommand.mockClear();
    mockInvalidateEventCaches.mockClear();
    mockBulkPublishEventsCommand.mockImplementation(() =>
      Promise.resolve({
        count: 1,
        skipped: 0,
        isPublished: true,
        affectedSlugs: ["event-1"],
        affectedTargets: [{ id: VALID_UUID_1, slug: "event-1" }],
      }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID 配列で公開できる", async () => {
      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkPublishEvents([VALID_UUID_1], true);

      expect(result).not.toHaveProperty("error");
      expect(mockBulkPublishEventsCommand).toHaveBeenCalledTimes(1);
      expect(mockBulkPublishEventsCommand).toHaveBeenCalledWith(
        [VALID_UUID_1],
        true,
      );
    });

    test("非公開アクションも実行できる", async () => {
      mockBulkPublishEventsCommand.mockImplementationOnce(() =>
        Promise.resolve({
          count: 1,
          skipped: 0,
          isPublished: false,
          affectedSlugs: ["event-1"],
          affectedTargets: [{ id: VALID_UUID_1, slug: "event-1" }],
        }),
      );

      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      await bulkPublishEvents([VALID_UUID_1], false);

      expect(mockBulkPublishEventsCommand).toHaveBeenCalledWith(
        [VALID_UUID_1],
        false,
      );
    });

    test("成功後に affectedTargets ごとに invalidateEventCaches が呼ばれる", async () => {
      mockBulkPublishEventsCommand.mockImplementationOnce(() =>
        Promise.resolve({
          count: 2,
          skipped: 0,
          isPublished: true,
          affectedSlugs: ["event-1", "event-2"],
          affectedTargets: [
            { id: VALID_UUID_1, slug: "event-1" },
            { id: VALID_UUID_2, slug: "event-2" },
          ],
        }),
      );

      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      await bulkPublishEvents([VALID_UUID_1, VALID_UUID_2], true);

      expect(mockInvalidateEventCaches).toHaveBeenCalledTimes(2);
      expect(mockInvalidateEventCaches).toHaveBeenCalledWith(
        VALID_UUID_1,
        "event-1",
        { registrations: true },
      );
      expect(mockInvalidateEventCaches).toHaveBeenCalledWith(
        VALID_UUID_2,
        "event-2",
        { registrations: true },
      );
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("空配列はエラーを返す", async () => {
      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkPublishEvents([], true);

      expect(result).toHaveProperty("error");
      expect(mockBulkPublishEventsCommand).not.toHaveBeenCalled();
    });

    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' を含む場合はエラーを返す",
      async (invalidId) => {
        const { bulkPublishEvents } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

        const result = await bulkPublishEvents([invalidId], true);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
        expect(mockBulkPublishEventsCommand).not.toHaveBeenCalled();
      },
    );

    test("100件超の配列はエラーを返す", async () => {
      const tooMany = Array.from({ length: 101 }, (_, i) => {
        const hex = i.toString(16).padStart(2, "0");
        return `${hex}${hex}${hex}${hex}-${hex}${hex}-4${hex}${hex}-8${hex}${hex}-${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}${hex}`;
      });

      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkPublishEvents(tooMany, true);

      expect(result).toHaveProperty("error");
      expect(mockBulkPublishEventsCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("DomainError は error を返す", async () => {
      mockBulkPublishEventsCommand.mockImplementationOnce(() =>
        Promise.reject(new DomainError("公開できません", "VALIDATION")),
      );

      const { bulkPublishEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkPublishEvents([VALID_UUID_1], true);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("公開できません");
    });
  });
});

describe("bulkSoftDeleteEvents", () => {
  beforeEach(() => {
    mockBulkSoftDeleteEventsCommand.mockClear();
    mockInvalidateEventCaches.mockClear();
    mockBulkSoftDeleteEventsCommand.mockImplementation(() =>
      Promise.resolve({
        count: 1,
        affectedSlugs: ["event-1"],
        affectedTargets: [{ id: VALID_UUID_1, slug: "event-1" }],
      }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID 配列でソフト削除できる", async () => {
      const { bulkSoftDeleteEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkSoftDeleteEvents([VALID_UUID_1]);

      expect(result).not.toHaveProperty("error");
      expect(mockBulkSoftDeleteEventsCommand).toHaveBeenCalledTimes(1);
    });

    test("actor.id を domain command に渡す", async () => {
      const { bulkSoftDeleteEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      await bulkSoftDeleteEvents([VALID_UUID_1]);

      expect(mockBulkSoftDeleteEventsCommand).toHaveBeenCalledWith(
        [VALID_UUID_1],
        { id: MOCK_ADMIN_USER.id },
      );
    });

    test("成功後に affectedTargets ごとに invalidateEventCaches が呼ばれる", async () => {
      mockBulkSoftDeleteEventsCommand.mockImplementationOnce(() =>
        Promise.resolve({
          count: 2,
          affectedSlugs: ["event-1", "event-2"],
          affectedTargets: [
            { id: VALID_UUID_1, slug: "event-1" },
            { id: VALID_UUID_2, slug: "event-2" },
          ],
        }),
      );

      const { bulkSoftDeleteEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      await bulkSoftDeleteEvents([VALID_UUID_1, VALID_UUID_2]);

      expect(mockInvalidateEventCaches).toHaveBeenCalledTimes(2);
      expect(mockInvalidateEventCaches).toHaveBeenCalledWith(
        VALID_UUID_1,
        "event-1",
        { registrations: true },
      );
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("空配列はエラーを返す", async () => {
      const { bulkSoftDeleteEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkSoftDeleteEvents([]);

      expect(result).toHaveProperty("error");
      expect(mockBulkSoftDeleteEventsCommand).not.toHaveBeenCalled();
    });

    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' を含む場合はエラーを返す",
      async (invalidId) => {
        const { bulkSoftDeleteEvents } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

        const result = await bulkSoftDeleteEvents([invalidId]);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
        expect(mockBulkSoftDeleteEventsCommand).not.toHaveBeenCalled();
      },
    );
  });

  describe("異常系: DomainError", () => {
    test("DomainError は error を返す", async () => {
      mockBulkSoftDeleteEventsCommand.mockImplementationOnce(() =>
        Promise.reject(new DomainError("削除できません", "VALIDATION")),
      );

      const { bulkSoftDeleteEvents } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk");

      const result = await bulkSoftDeleteEvents([VALID_UUID_1]);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("削除できません");
    });
  });
});
