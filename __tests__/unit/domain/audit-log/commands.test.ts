import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockAuditLogCreate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
type LastAuditLogChainEntry = { sequence: bigint; entryHash: string } | null;
const mockTxAuditLogFindFirst = mock<() => Promise<LastAuditLogChainEntry>>(
  () => Promise.resolve(null),
);
const mockTxAuditLogCreate = mock((args: unknown) => Promise.resolve(args));
const mockTxExecuteRaw = mock(() => Promise.resolve(undefined));
const mockTransaction = mock(
  async (
    callback: (tx: {
      $executeRaw: typeof mockTxExecuteRaw;
      auditLog: {
        findFirst: typeof mockTxAuditLogFindFirst;
        create: typeof mockTxAuditLogCreate;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      $executeRaw: mockTxExecuteRaw,
      auditLog: {
        findFirst: mockTxAuditLogFindFirst,
        create: mockTxAuditLogCreate,
      },
    }),
);
const mockConsoleInfo = mock<(message?: unknown) => void>(() => {});
const originalConsoleInfo = console.info;

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    NODE_ENV: "test",
    AUDIT_LOG_HMAC_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    AUDIT_LOG_HMAC_KEY_ID: "test-key",
  },
}));

// AuditAction enum モック
mock.module("@generated/prisma/enums", () => ({
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
    mockTxAuditLogFindFirst.mockReset();
    mockTxAuditLogFindFirst.mockResolvedValue(null);
    mockTxAuditLogCreate.mockReset();
    mockTxAuditLogCreate.mockImplementation((args: unknown) =>
      Promise.resolve(args),
    );
    mockTxExecuteRaw.mockReset();
    mockTxExecuteRaw.mockResolvedValue(undefined);
    mockTransaction.mockClear();
    mockConsoleInfo.mockClear();
    console.info = mockConsoleInfo;
  });

  afterEach(() => {
    console.info = originalConsoleInfo;
  });

  describe("正常系", () => {
    test("必須フィールドのみで監査ログを作成できる", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: RESOURCE,
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledTimes(1);
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

      expect(mockTxAuditLogCreate).toHaveBeenCalledTimes(1);
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

      expect(mockTxAuditLogCreate).toHaveBeenCalledTimes(1);
    });

    test("metadata がオブジェクトの場合 JSON.parse(JSON.stringify) でシリアライズされる", async () => {
      const metadata = { ip: "192.168.1.1", userAgent: "Mozilla" };

      await createAuditLogRecord({
        action: "LOGIN_SUCCESS",
        resource: "auth",
        metadata,
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "LOGIN_SUCCESS",
            resource: "auth",
            metadata: { ip: "192.168.1.1", userAgent: "Mozilla" },
          }),
        }),
      );
    });

    test("oldValue/newValue/metadata の秘密情報キーは保存前にマスクされる", async () => {
      await createAuditLogRecord({
        action: "UPDATE",
        resource: "settings",
        oldValue: {
          stripeSecretKey: "sk_live_old",
          nested: { refreshToken: "refresh-old", safe: "keep" },
        },
        newValue: {
          stripeSecretKey: "sk_live_new",
          nested: { refreshToken: "refresh-new", safe: "keep" },
        },
        metadata: {
          authorization: "Bearer secret",
          apiKeyId: "public-key-id",
        },
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldValue: {
              stripeSecretKey: "[REDACTED]",
              nested: { refreshToken: "[REDACTED]", safe: "keep" },
            },
            newValue: {
              stripeSecretKey: "[REDACTED]",
              nested: { refreshToken: "[REDACTED]", safe: "keep" },
            },
            metadata: {
              authorization: "[REDACTED]",
              apiKeyId: "public-key-id",
            },
          }),
        }),
      );
    });

    test("ハッシュチェーン用の sequence と hash をトランザクション内で付与する", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: "post",
        resourceId: "post-1",
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxExecuteRaw).toHaveBeenCalledTimes(1);
      expect(mockTxAuditLogFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sequence: "desc" },
        }),
      );
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sequence: 1n,
            previousHash: "0".repeat(64),
            entryHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
            hashAlgorithm: "HMAC-SHA256",
            hashKeyId: "test-key",
            chainVersion: 1,
          }),
        }),
      );
    });

    test("既存の末尾 hash を次の previousHash として使う", async () => {
      mockTxAuditLogFindFirst.mockResolvedValueOnce({
        sequence: 41n,
        entryHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      await createAuditLogRecord({
        action: "UPDATE",
        resource: "settings",
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sequence: 42n,
            previousHash:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            entryHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
          }),
        }),
      );
    });

    test("コミット後に Cloud Logging 向けのアンカーを構造化ログとして出力する", async () => {
      await createAuditLogRecord({
        action: "EXPORT",
        resource: "auditLog",
      });

      expect(mockConsoleInfo).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(
        String(mockConsoleInfo.mock.calls[0]?.[0]),
      ) as {
        message: string;
        component: string;
        auditLogIntegrityAnchor: {
          sequence: string;
          entryHash: string;
          hashKeyId: string;
        };
      };
      expect(payload.message).toBe("audit_log_integrity_anchor");
      expect(payload.component).toBe("audit-log-integrity");
      expect(payload.auditLogIntegrityAnchor.sequence).toBe("1");
      expect(payload.auditLogIntegrityAnchor.entryHash).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      expect(payload.auditLogIntegrityAnchor.hashKeyId).toBe("test-key");
    });
  });

  describe("エッジケース", () => {
    test("resourceId が undefined の場合 create データから省かれる", async () => {
      await createAuditLogRecord({
        action: "CREATE",
        resource: RESOURCE,
      });

      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ resourceId: expect.anything() }),
        }),
      );
    });

    test("複数の監査ログを連続して作成できる", async () => {
      await createAuditLogRecord({ action: "CREATE", resource: "post" });
      await createAuditLogRecord({ action: "UPDATE", resource: "post" });
      await createAuditLogRecord({ action: "DELETE", resource: "post" });

      expect(mockTxAuditLogCreate).toHaveBeenCalledTimes(3);
    });
  });
});
