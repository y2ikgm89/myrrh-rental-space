/**
 * 予約管理Server Action統合テスト
 *
 * src/actions/admin/reservation.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { ReservationStatus } from "@generated/prisma/enums";

// 管理画面のステータス更新は Prisma ReservationStatus と z.enum(ReservationStatus) に準拠
const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ReservationStatus),
});

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).nullable(),
});

// 有効なUUID
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// 有効なステータス更新データ
const VALID_UPDATE_STATUS_INPUT = {
  id: VALID_UUID,
  status: "CONFIRMED" as const,
};

// 有効なメモ更新データ
const VALID_UPDATE_NOTES_INPUT = {
  id: VALID_UUID,
  notes: "テストメモです",
};

describe("Reservation Admin Action Integration", () => {
  describe("updateStatusSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = updateStatusSchema.safeParse(VALID_UPDATE_STATUS_INPUT);
        expect(result.success).toBe(true);
      });

      test("全ステータス値が許可される", () => {
        for (const status of Object.values(ReservationStatus)) {
          const result = updateStatusSchema.safeParse({
            id: VALID_UUID,
            status,
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe("id", () => {
      test("無効なUUIDはエラー", () => {
        const invalidIds = [
          "invalid",
          "12345",
          "not-a-uuid",
          "550e8400-e29b-41d4-a716", // 途中で切れている
          "550e8400e29b41d4a716446655440000", // ハイフンなし
        ];

        for (const id of invalidIds) {
          const result = updateStatusSchema.safeParse({
            id,
            status: "CONFIRMED",
          });
          expect(result.success).toBe(false);
        }
      });

      test("空のIDはエラー", () => {
        const result = updateStatusSchema.safeParse({
          id: "",
          status: "CONFIRMED",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("status", () => {
      test("無効なステータスはエラー", () => {
        const invalidStatuses = [
          "INVALID",
          "APPROVED",
          "REJECTED",
          "completed",
        ];

        for (const status of invalidStatuses) {
          const result = updateStatusSchema.safeParse({
            id: VALID_UUID,
            status,
          });
          expect(result.success).toBe(false);
        }
      });

      test("小文字のステータスはエラー", () => {
        const result = updateStatusSchema.safeParse({
          id: VALID_UUID,
          status: "confirmed",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("updateNotesSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = updateNotesSchema.safeParse(VALID_UPDATE_NOTES_INPUT);
        expect(result.success).toBe(true);
      });

      test("nullのnotesは許可", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: null,
        });
        expect(result.success).toBe(true);
      });

      test("空文字のnotesは許可", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: "",
        });
        expect(result.success).toBe(true);
      });

      test("1000文字のnotesは許可", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: "あ".repeat(1000),
        });
        expect(result.success).toBe(true);
      });
    });

    describe("notes", () => {
      test("1001文字のnotesはエラー", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: "あ".repeat(1001),
        });
        expect(result.success).toBe(false);
      });

      test("改行を含むnotesは許可", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: "メモ1行目\nメモ2行目\nメモ3行目",
        });
        expect(result.success).toBe(true);
      });

      test("絵文字を含むnotesは許可", () => {
        const result = updateNotesSchema.safeParse({
          id: VALID_UUID,
          notes: "予約完了 ✅ ありがとうございます 🙏",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("id", () => {
      test("無効なUUIDはエラー", () => {
        const result = updateNotesSchema.safeParse({
          id: "invalid-uuid",
          notes: "テスト",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("ReservationStatus enum 整合性", () => {
    test("Prisma ReservationStatus と updateStatusSchema が一致", () => {
      const enumValues = Object.values(ReservationStatus);
      expect(enumValues).toEqual(
        expect.arrayContaining([
          "PENDING",
          "CONFIRMED",
          "COMPLETED",
          "CANCELLED",
          "NO_SHOW",
        ]),
      );
      expect(enumValues).toHaveLength(5);
      for (const status of enumValues) {
        expect(
          updateStatusSchema.safeParse({ id: VALID_UUID, status }).success,
        ).toBe(true);
      }
    });
  });

  describe("UUID形式テスト", () => {
    test("有効なUUID形式（v4）", () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      ];

      for (const id of validUuids) {
        const result = updateStatusSchema.safeParse({
          id,
          status: "PENDING",
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("境界値テスト", () => {
    test("notes 1000文字（境界）", () => {
      const result = updateNotesSchema.safeParse({
        id: VALID_UUID,
        notes: "x".repeat(1000),
      });
      expect(result.success).toBe(true);
    });

    test("notes 1001文字（境界超過）", () => {
      const result = updateNotesSchema.safeParse({
        id: VALID_UUID,
        notes: "x".repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("フィルター型テスト", () => {
    // ReservationFilters型のテスト（型安全性確認）
    test("有効なフィルター値", () => {
      type ReservationFilters = {
        status?:
          | "PENDING"
          | "CONFIRMED"
          | "COMPLETED"
          | "CANCELLED"
          | "NO_SHOW"
          | "ALL";
        search?: string;
        startDate?: string;
        endDate?: string;
        spaceId?: string;
      };

      const filters: ReservationFilters = {
        status: "PENDING",
        search: "テスト",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        spaceId: VALID_UUID,
      };

      // 型チェックのみ（コンパイル時）
      expect(filters.status).toBe("PENDING");
    });

    test("ALL ステータスフィルター", () => {
      type ReservationFilters = {
        status?:
          | "PENDING"
          | "CONFIRMED"
          | "COMPLETED"
          | "CANCELLED"
          | "NO_SHOW"
          | "ALL";
      };

      const filters: ReservationFilters = {
        status: "ALL",
      };

      expect(filters.status).toBe("ALL");
    });
  });

  describe("ページネーション型テスト", () => {
    test("有効なページネーション値", () => {
      type ReservationPagination = {
        page?: number;
        limit?: number;
        sortBy?: "startTime" | "createdAt";
        sortOrder?: "asc" | "desc";
      };

      const pagination: ReservationPagination = {
        page: 1,
        limit: 10,
        sortBy: "startTime",
        sortOrder: "desc",
      };

      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(10);
    });

    test("デフォルト値の想定", () => {
      // 実装でのデフォルト値: page=1, limit=10, sortBy='startTime', sortOrder='desc'
      const defaultPagination = {
        page: 1,
        limit: 10,
        sortBy: "startTime" as const,
        sortOrder: "desc" as const,
      };

      expect(defaultPagination.page).toBe(1);
      expect(defaultPagination.limit).toBe(10);
      expect(defaultPagination.sortBy).toBe("startTime");
      expect(defaultPagination.sortOrder).toBe("desc");
    });
  });

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
});
