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
    mockGetAuditLogsForExport.mockResolvedValue({
      truncated: false,
      logs: [
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
      ],
    });
    mockGenerateCsv.mockReturnValue("\uFEFF日時,ユーザー\r\n");

    const response = await GET(
      new Request(
        "http://localhost/api/admin/export/audit-logs?action=UPDATE&resource=settings&dateFrom=2026-07-01&dateTo=2026-07-31&search=admin&ipAddress=203.0.113.10&securityOnly=1",
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
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        search: "admin",
        ipAddress: "203.0.113.10",
        securityOnly: true,
      }),
    );
    expect(mockGetAuditLogsForExport.mock.calls[0]?.[0]).not.toHaveProperty(
      "perPage",
    );
    expect(mockGetAuditLogsForExport.mock.calls[0]?.[0]).not.toHaveProperty(
      "page",
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

  test("dateFrom と dateTo が必須で、90 日を超える期間は 400 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "SUPER_ADMIN" },
    });

    const missingBoth = await GET(
      new Request("http://localhost/api/admin/export/audit-logs"),
    );
    const missingTo = await GET(
      new Request(
        "http://localhost/api/admin/export/audit-logs?dateFrom=2026-07-01",
      ),
    );
    const tooWide = await GET(
      new Request(
        "http://localhost/api/admin/export/audit-logs?dateFrom=2026-01-01&dateTo=2026-04-02",
      ),
    );

    expect(missingBoth.status).toBe(400);
    expect(missingTo.status).toBe(400);
    expect(tooWide.status).toBe(400);
    expect(missingBoth.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mockGetAuditLogsForExport).not.toHaveBeenCalled();
    expect(mockGenerateCsv).not.toHaveBeenCalled();
  });

  test("件数が上限を超えたら部分 CSV を返さず 409 と totalCount を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "SUPER_ADMIN" },
    });
    mockGetAuditLogsForExport.mockResolvedValue({
      truncated: true,
      totalCount: 25_000,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/export/audit-logs?dateFrom=2026-07-01&dateTo=2026-07-31",
      ),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual(
      expect.objectContaining({ totalCount: 25_000 }),
    );
    expect(mockGenerateCsv).not.toHaveBeenCalled();
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "EXPORT",
        resource: "auditLog",
        metadata: expect.objectContaining({
          truncated: true,
          totalCount: 25_000,
        }),
      }),
    );
  });
});
