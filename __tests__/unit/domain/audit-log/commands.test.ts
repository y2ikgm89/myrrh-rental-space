import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockAuditLogCreate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

// AuditAction enum モック
mock.module("@/shared/db/enums", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    PUBLISH: "PUBLISH",
    LOGIN: "LOGIN",
  },
}));

// omitUndefined モック（実際の実装を使いたいが server-only 依存回避のため）
mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  },
}));

import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";

// テスト用定数
const USER_ID = "user-1";
const RESOURCE = "post";
const RESOURCE_ID = "post-1";

describe("createAuditLogRecord", () => {
  beforeEach(() => {
    mockAuditLogCreate.mockReset();
    mockAuditLogCreate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("必須フィールドのみで監査ログを作成できる", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: RESOURCE,
      });

      expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    });

    test("全フィールドを指定して監査ログを作成できる", async () => {
      const oldValue = { status: "DRAFT" };
      const newValue = { status: "PUBLISHED" };
      const metadata = { ip: "127.0.0.1" };

      await createAuditLogRecord({
        userId: USER_ID,
        action: "UPDATE",
        resource: RESOURCE,
        resourceId: RESOURCE_ID,
        oldValue,
        newValue,
        metadata,
      });

      expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    });

    test("void を返す（戻り値なし）", async () => {
      const result = await createAuditLogRecord({
        action: "DELETE",
        resource: RESOURCE,
      });

      expect(result).toBeUndefined();
    });

    test("userId なしで作成できる（任意フィールド）", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: "settings",
        resourceId: "singleton",
      });

      expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    });

    test("metadata がオブジェクトの場合 JSON.parse(JSON.stringify) でシリアライズされる", async () => {
      const metadata = { ip: "192.168.1.1", userAgent: "Mozilla" };

      await createAuditLogRecord({
        action: "LOGIN_SUCCESS",
        resource: "auth",
        metadata,
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "LOGIN_SUCCESS",
            resource: "auth",
            metadata: { ip: "192.168.1.1", userAgent: "Mozilla" },
          }),
        }),
      );
    });
  });

  describe("エッジケース", () => {
    test("resourceId が undefined の場合 create データから省かれる", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: RESOURCE,
      });

      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ resourceId: expect.anything() }),
        }),
      );
    });

    test("複数の監査ログを連続して作成できる", async () => {
      await createAuditLogRecord({ action: "CREATE", resource: "post" });
      await createAuditLogRecord({ action: "UPDATE", resource: "post" });
      await createAuditLogRecord({ action: "DELETE", resource: "post" });

      expect(mockAuditLogCreate).toHaveBeenCalledTimes(3);
    });
  });
});
