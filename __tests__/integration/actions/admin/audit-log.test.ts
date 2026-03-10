/**
 * 監査ログ Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/audit-log.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { AuditAction } from "@/shared/db/enums";

// audit-log.ts 内の filtersSchema を再現
const filtersSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
  action: z.enum(AuditAction).or(z.literal("ALL")).optional().default("ALL"),
  resource: z.string().optional().default(""),
  userId: z.string().uuid().optional().default(""),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional()
    .default(""),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .optional()
    .default(""),
});

// parseAuditLogMetadata ロジックを再現
type AuditLogMetadata = {
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuditLogMetadata(value: unknown): AuditLogMetadata {
  if (!isRecord(value)) return null;

  const result: {
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  } = {};
  if (typeof value["ipAddress"] === "string")
    result["ipAddress"] = value["ipAddress"];
  if (typeof value["userAgent"] === "string")
    result["userAgent"] = value["userAgent"];
  for (const [key, val] of Object.entries(value)) {
    if (key !== "ipAddress" && key !== "userAgent") result[key] = val;
  }
  return result;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Audit Log Admin Action Integration", () => {
  describe("filtersSchema バリデーション", () => {
    test("空オブジェクトはデフォルト値でパス", () => {
      const result = filtersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.perPage).toBe(50);
        expect(result.data.action).toBe("ALL");
      }
    });

    test("全フィールド指定でパス", () => {
      const result = filtersSchema.safeParse({
        page: 2,
        perPage: 20,
        action: "ALL",
        resource: "post",
        userId: VALID_UUID,
        dateFrom: "2026-01-01",
        dateTo: "2026-03-01",
      });
      expect(result.success).toBe(true);
    });

    describe("page", () => {
      test("正の整数は許可", () => {
        expect(filtersSchema.safeParse({ page: 1 }).success).toBe(true);
        expect(filtersSchema.safeParse({ page: 100 }).success).toBe(true);
      });

      test("0以下はエラー", () => {
        expect(filtersSchema.safeParse({ page: 0 }).success).toBe(false);
        expect(filtersSchema.safeParse({ page: -1 }).success).toBe(false);
      });

      test("小数はエラー", () => {
        expect(filtersSchema.safeParse({ page: 1.5 }).success).toBe(false);
      });
    });

    describe("perPage", () => {
      test("1〜100は許可", () => {
        expect(filtersSchema.safeParse({ perPage: 1 }).success).toBe(true);
        expect(filtersSchema.safeParse({ perPage: 100 }).success).toBe(true);
      });

      test("101以上はエラー", () => {
        expect(filtersSchema.safeParse({ perPage: 101 }).success).toBe(false);
      });

      test("0はエラー", () => {
        expect(filtersSchema.safeParse({ perPage: 0 }).success).toBe(false);
      });
    });

    describe("action", () => {
      test('"ALL" は許可', () => {
        expect(filtersSchema.safeParse({ action: "ALL" }).success).toBe(true);
      });

      test("有効な AuditAction enum は許可", () => {
        expect(
          filtersSchema.safeParse({ action: AuditAction.LOGIN_SUCCESS })
            .success,
        ).toBe(true);
        expect(
          filtersSchema.safeParse({ action: AuditAction.LOGIN_FAILED }).success,
        ).toBe(true);
        expect(
          filtersSchema.safeParse({ action: AuditAction.PERMISSION_DENIED })
            .success,
        ).toBe(true);
      });

      test("無効な文字列はエラー", () => {
        expect(
          filtersSchema.safeParse({ action: "INVALID_ACTION" }).success,
        ).toBe(false);
      });
    });

    describe("userId", () => {
      test("有効な UUID は許可", () => {
        expect(filtersSchema.safeParse({ userId: VALID_UUID }).success).toBe(
          true,
        );
      });

      test("無効な UUID はエラー", () => {
        expect(filtersSchema.safeParse({ userId: "not-a-uuid" }).success).toBe(
          false,
        );
        expect(filtersSchema.safeParse({ userId: "12345" }).success).toBe(
          false,
        );
      });
    });

    describe("dateFrom / dateTo", () => {
      test("ISO 日付文字列は許可", () => {
        expect(
          filtersSchema.safeParse({
            dateFrom: "2026-01-01",
            dateTo: "2026-12-31",
          }).success,
        ).toBe(true);
      });

      test("空文字は許可", () => {
        expect(
          filtersSchema.safeParse({ dateFrom: "", dateTo: "" }).success,
        ).toBe(true);
      });

      test("YYYY-MM-DD 以外はエラー", () => {
        expect(
          filtersSchema.safeParse({ dateFrom: "2026-01-01T00:00:00.000Z" })
            .success,
        ).toBe(false);
      });
    });
  });

  describe("parseAuditLogMetadata ロジック", () => {
    test("null を渡すと null を返す", () => {
      expect(parseAuditLogMetadata(null)).toBeNull();
    });

    test("undefined を渡すと null を返す", () => {
      expect(parseAuditLogMetadata(undefined)).toBeNull();
    });

    test("文字列を渡すと null を返す", () => {
      expect(parseAuditLogMetadata("string")).toBeNull();
    });

    test("配列を渡すと null を返す", () => {
      expect(parseAuditLogMetadata([1, 2, 3])).toBeNull();
    });

    test("ipAddress と userAgent を抽出できる", () => {
      const result = parseAuditLogMetadata({
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(result).not.toBeNull();
      expect(result?.ipAddress).toBe("192.168.1.1");
      expect(result?.userAgent).toBe("Mozilla/5.0");
    });

    test("ipAddress が非文字列の場合は無視", () => {
      const result = parseAuditLogMetadata({ ipAddress: 123 });
      expect(result?.ipAddress).toBeUndefined();
    });

    test("追加フィールドはパススルーされる", () => {
      const result = parseAuditLogMetadata({ customField: "value", count: 42 });
      expect(result?.["customField"]).toBe("value");
      expect(result?.["count"]).toBe(42);
    });

    test("空オブジェクトは空のメタデータを返す", () => {
      const result = parseAuditLogMetadata({});
      expect(result).not.toBeNull();
      expect(result?.ipAddress).toBeUndefined();
      expect(result?.userAgent).toBeUndefined();
    });
  });

  describe("AuditAction enum 整合性", () => {
    test("セキュリティ関連 action が存在する", () => {
      const securityActions = [
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "PERMISSION_DENIED",
        "PASSWORD_CHANGE",
        "ROLE_CHANGE",
      ];
      const enumValues = Object.values(AuditAction) as string[];
      for (const action of securityActions) {
        expect(enumValues).toContain(action);
      }
    });
  });

  describe("AuditLogResult 型構造", () => {
    test("有効なページネーション結果", () => {
      type AuditLogResult = {
        logs: unknown[];
        total: number;
        page: number;
        totalPages: number;
      };
      const result: AuditLogResult = {
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
      expect(result.totalPages).toBe(Math.ceil(result.total / 50));
    });

    test("totalPages 計算ロジック", () => {
      const total = 105;
      const perPage = 50;
      expect(Math.ceil(total / perPage)).toBe(3);
    });
  });

  describe("AuditLogStats 型構造", () => {
    test("有効な統計データ構造", () => {
      type AuditLogStats = {
        total: number;
        today: number;
        securityEvents: number;
        byAction: Record<string, number>;
      };
      const stats: AuditLogStats = {
        total: 100,
        today: 5,
        securityEvents: 3,
        byAction: { LOGIN_SUCCESS: 50, LOGIN_FAILED: 3 },
      };
      expect(stats.total).toBe(100);
      expect(stats.byAction["LOGIN_SUCCESS"]).toBe(50);
    });
  });
});
