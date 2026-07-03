import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetAuditLogsForExport = mock();
const mockGenerateCsv = mock<
  (rows: unknown[], columns: { header: string }[]) => string
>(() => "");
const mockCreateAuditLogRecord = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/audit-log/queries", () => ({
  getAuditLogsForExport: (
    ...args: Parameters<typeof mockGetAuditLogsForExport>
  ) => mockGetAuditLogsForExport(...args),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/csv", () => ({
  generateCsv: (...args: Parameters<typeof mockGenerateCsv>) =>
    mockGenerateCsv(...args),
}));

const { GET } = await import("@/app/api/admin/export/audit-logs/route");

describe("GET /api/admin/export/audit-logs", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetAuditLogsForExport.mockReset();
    mockGenerateCsv.mockReset();
    mockCreateAuditLogRecord.mockReset();
  });

  test("auditLog:manage 権限がなければ 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { error: "権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/export/audit-logs"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "権限がありません" });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "auditLog",
      "manage",
      expect.any(Headers),
    );
    expect(mockGetAuditLogsForExport).not.toHaveBeenCalled();
  });

  test("正常時は no-store CSV を返し export 自体を監査する", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "SUPER_ADMIN" },
    });
    mockGetAuditLogsForExport.mockResolvedValue([
      {
        id: "audit-1",
        userId: "user-1",
        action: "UPDATE",
        resource: "settings",
        resourceId: null,
        oldValue: null,
        newValue: null,
        metadata: { ipAddress: "203.0.113.10" },
        createdAt: "2026-07-01T00:00:00.000Z",
        user: { id: "user-1", name: "Admin", email: "admin@example.com" },
      },
    ]);
    mockGenerateCsv.mockReturnValue("\uFEFF日時,ユーザー\r\n");

    const response = await GET(
      new Request(
        "http://localhost/api/admin/export/audit-logs?action=UPDATE&resource=settings&search=admin&ipAddress=203.0.113.10&securityOnly=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="audit-logs-\d{8}\.csv"$/,
    );
    expect(mockGetAuditLogsForExport).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        resource: "settings",
        search: "admin",
        ipAddress: "203.0.113.10",
        securityOnly: true,
      }),
    );
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "EXPORT",
        resource: "auditLog",
        metadata: expect.objectContaining({
          format: "csv",
          exportedCount: 1,
          filters: expect.objectContaining({
            action: "UPDATE",
            resource: "settings",
          }),
        }),
      }),
    );
  });
});
