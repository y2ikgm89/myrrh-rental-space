import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckPermission = mock();
const mockGetEventRegistrationsForExport = mock();
type CsvColumn = { header: string; accessor?: (row: unknown) => unknown };
const mockGenerateCsv = mock<(rows: unknown[], columns: CsvColumn[]) => string>(
  () => "",
);
const mockCreateAuditLogRecord = mock();

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/events/export-queries", () => ({
  getEventRegistrationsForExport: (
    ...args: Parameters<typeof mockGetEventRegistrationsForExport>
  ) => mockGetEventRegistrationsForExport(...args),
}));

mock.module("@/shared/lib/csv", () => ({
  generateCsv: (...args: Parameters<typeof mockGenerateCsv>) =>
    mockGenerateCsv(...args),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

const { GET } =
  await import("@/app/api/admin/export/event-registrations/route");

describe("GET /api/admin/export/event-registrations", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetEventRegistrationsForExport.mockReset();
    mockGenerateCsv.mockReset();
    mockCreateAuditLogRecord.mockReset();
  });

  test("CUID の eventId でイベント申込 CSV を返す", async () => {
    const eventId = "cm0event1234567890123456";
    const registration = {
      id: "cm0reg12345678901234567",
      name: "佐藤花子",
      email: "sato@example.com",
      phone: "090-0000-0000",
      quantity: 2,
      status: "CONFIRMED",
      note: null,
      attendedAt: null,
      cancelledAt: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      event: {
        title: "複数枠イベント",
        startTime: new Date("2026-07-10T01:00:00.000Z"),
        location: "青山 / Room A",
      },
    };

    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetEventRegistrationsForExport.mockResolvedValue([registration]);
    mockGenerateCsv.mockReturnValue("\uFEFF氏名,メール\r\n");

    const response = await GET(
      new Request(
        `http://localhost/api/admin/export/event-registrations?eventId=${eventId}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="event-registrations-\d{8}\.csv"$/,
    );
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "event",
      "read",
      expect.any(Headers),
    );
    expect(mockGetEventRegistrationsForExport).toHaveBeenCalledWith(eventId);
    expect(mockGenerateCsv).toHaveBeenCalledWith(
      [registration],
      expect.arrayContaining([
        expect.objectContaining({ header: "氏名" }),
        expect.objectContaining({ header: "出席日時" }),
      ]),
    );
  });

  test("不正な eventId は DB に到達せず 400 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/export/event-registrations?eventId=../bad",
      ),
    );

    expect(response.status).toBe(400);
    expect(mockGetEventRegistrationsForExport).not.toHaveBeenCalled();
    expect(mockGenerateCsv).not.toHaveBeenCalled();
  });

  test("format=xlsx の場合は Excel ワークブックを返す", async () => {
    const eventId = "cm0event1234567890123456";
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "user-1", role: "ADMIN" },
    });
    mockGetEventRegistrationsForExport.mockResolvedValue([
      {
        id: "cm0reg12345678901234567",
        name: "佐藤花子",
        email: "sato@example.com",
        phone: null,
        quantity: 2,
        status: "CONFIRMED",
        note: null,
        attendedAt: new Date("2026-07-10T01:30:00.000Z"),
        cancelledAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        event: {
          title: "複数枠イベント",
          startTime: new Date("2026-07-10T01:00:00.000Z"),
          location: "青山 / Room A",
        },
      },
    ]);

    const response = await GET(
      new Request(
        `http://localhost/api/admin/export/event-registrations?eventId=${eventId}&format=xlsx`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="event-registrations-\d{8}\.xlsx"$/,
    );
    expect(mockGenerateCsv).not.toHaveBeenCalled();
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
