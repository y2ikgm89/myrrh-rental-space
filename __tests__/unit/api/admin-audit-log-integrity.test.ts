import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockCreateAuditLogRecord = mock();
const mockVerifyAuditLogIntegrity = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/domain/audit-log/integrity", () => ({
  verifyAuditLogIntegrity: (
    ...args: Parameters<typeof mockVerifyAuditLogIntegrity>
  ) => mockVerifyAuditLogIntegrity(...args),
}));

const { GET } = await import("@/app/api/admin/audit-logs/integrity/route");

describe("GET /api/admin/audit-logs/integrity", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockVerifyAuditLogIntegrity.mockReset();
  });

  test("auditLog:manage 権限がなければ 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { error: "権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/audit-logs/integrity"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "権限がありません" });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "auditLog",
      "manage",
      expect.any(Headers),
    );
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockVerifyAuditLogIntegrity).not.toHaveBeenCalled();
  });

  test("正常時は検証操作を監査して no-store JSON を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "SUPER_ADMIN" },
    });
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockVerifyAuditLogIntegrity.mockResolvedValue({
      ok: true,
      checkedCount: 2,
      latestSequence: "2",
      latestHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      checkedAt: "2026-07-02T00:00:00.000Z",
      failures: [],
    });

    const response = await GET(
      new Request("http://localhost/api/admin/audit-logs/integrity"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "INTEGRITY_CHECK",
        resource: "auditLog",
        metadata: expect.objectContaining({
          operation: "verifyAuditLogIntegrity",
        }),
      }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      checkedCount: 2,
      latestSequence: "2",
      latestHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      checkedAt: "2026-07-02T00:00:00.000Z",
      failures: [],
    });
  });

  test("改ざん検出時は 409 と失敗詳細を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "SUPER_ADMIN" },
    });
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockVerifyAuditLogIntegrity.mockResolvedValue({
      ok: false,
      checkedCount: 1,
      latestSequence: "1",
      latestHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      checkedAt: "2026-07-02T00:00:00.000Z",
      failures: [
        {
          sequence: "1",
          id: "audit-1",
          reason: "ENTRY_HASH_MISMATCH",
          expected:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          actual:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/admin/audit-logs/integrity"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        ok: false,
        failures: expect.arrayContaining([
          expect.objectContaining({ reason: "ENTRY_HASH_MISMATCH" }),
        ]),
      }),
    );
  });
});
