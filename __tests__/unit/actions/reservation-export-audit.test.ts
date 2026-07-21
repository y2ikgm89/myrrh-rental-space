/**
 * 予約 CSV エクスポート (GET /api/admin/export/reservations) の AuditLog metadata
 * が tab/search/dateFrom/dateTo/userId/spaceId の全フィルタを記録することを検証する。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuthResult = {
  success: boolean;
  user: { id: string };
  error?: { error: string };
};

const mockCheckPermission = mock<
  (perm: string, action: string, headers: Headers) => Promise<AuthResult>
>(async () => ({
  success: true,
  user: { id: "admin-1" },
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

type ReservationForExport = {
  id: string;
  space: { name: string };
  customer: {
    lastName: string;
    firstName: string;
    companyName: string;
    email: string;
    phoneNumber: string;
  };
  guestLastName: string | null;
  guestFirstName: string | null;
  guestPhone: string | null;
  startTime: Date;
  endTime: Date;
  basePrice: number;
  couponDiscountAmount: number;
  totalPrice: number;
  coupon: { code: string } | null;
  status: string;
  paymentStatus: string;
  notes: string | null;
  createdAt: Date;
};

const mockGetReservationsForExport = mock<
  (filters: Record<string, unknown>) => Promise<ReservationForExport[]>
>(async () => [
  {
    id: "res-1",
    space: { name: "Space A" },
    customer: {
      lastName: "太郎",
      firstName: "山田",
      companyName: "Company A",
      email: "test@example.com",
      phoneNumber: "090-1234-5678",
    },
    guestLastName: null,
    guestFirstName: null,
    guestPhone: null,
    startTime: new Date("2026-07-22T10:00:00Z"),
    endTime: new Date("2026-07-22T12:00:00Z"),
    basePrice: 10000,
    couponDiscountAmount: 0,
    totalPrice: 10000,
    coupon: null,
    status: "confirmed",
    paymentStatus: "paid",
    notes: null,
    createdAt: new Date("2026-07-20T00:00:00Z"),
  },
]);

mock.module("@/shared/domain/reservations/export-queries", () => ({
  getReservationsForExport: (
    ...args: Parameters<typeof mockGetReservationsForExport>
  ) => mockGetReservationsForExport(...args),
}));

const mockGenerateCsv = mock<(data: unknown[], columns: unknown[]) => string>(
  () => "id,space\nres-1,Space A",
);

mock.module("@/shared/lib/csv", () => ({
  generateCsv: (...args: Parameters<typeof mockGenerateCsv>) =>
    mockGenerateCsv(...args),
}));

mock.module("@/shared/lib/date-format", () => ({
  formatJstDateString: (date: Date) => "2026-07-22",
  formatJstYmd: (date: Date) => "2026-07-22",
  formatJstYmdHm: (date: Date) => "2026-07-22 10:00",
  formatTimeShort: (date: Date) => "10:00",
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  RESERVATION_STATUS_LABELS: { confirmed: "確認済", completed: "完了" },
  PAYMENT_STATUS_LABELS: { paid: "支払済", pending: "未支払" },
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { HIGH: "HIGH" },
  getRouteErrorStatus: mock(() => 500),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  getRouteErrorStatus: (message: string) => 403,
}));

const { GET } = await import("@/app/api/admin/export/reservations/route");
const { AuditAction } =
  await import("@/shared/lib/validations/enums/prisma-types");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("GET /api/admin/export/reservations の AuditLog metadata", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-1" },
    });
    mockGetReservationsForExport.mockReset();
    mockGetReservationsForExport.mockResolvedValue([
      {
        id: "res-1",
        space: { name: "Space A" },
        customer: {
          lastName: "太郎",
          firstName: "山田",
          companyName: "Company A",
          email: "test@example.com",
          phoneNumber: "090-1234-5678",
        },
        guestLastName: null,
        guestFirstName: null,
        guestPhone: null,
        startTime: new Date("2026-07-22T10:00:00Z"),
        endTime: new Date("2026-07-22T12:00:00Z"),
        basePrice: 10000,
        couponDiscountAmount: 0,
        totalPrice: 10000,
        coupon: null,
        status: "confirmed",
        paymentStatus: "paid",
        notes: null,
        createdAt: new Date("2026-07-20T00:00:00Z"),
      },
    ]);
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("フィルタなし時に audit metadata に全フィルタが含まれない", async () => {
    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe(AuditAction.EXPORT);
    expect(call["resource"]).toBe("reservation");
    const metadata = call["metadata"] as Record<string, unknown>;
    expect(metadata["format"]).toBe("csv");
    expect(metadata["exportedCount"]).toBe(1);
    expect(metadata["filterTab"]).toBeUndefined();
    expect(metadata["filterSearch"]).toBeUndefined();
    expect(metadata["filterStartDate"]).toBeUndefined();
    expect(metadata["filterEndDate"]).toBeUndefined();
    expect(metadata["filterUserId"]).toBeUndefined();
    expect(metadata["filterSpaceId"]).toBeUndefined();
  });

  test("全フィルタを含む URL で audit metadata に全フィルタが記録される", async () => {
    const url = new URL("http://localhost/api/admin/export/reservations");
    url.searchParams.set("tab", "confirmed");
    url.searchParams.set("search", "山田");
    url.searchParams.set("dateFrom", "2026-07-01");
    url.searchParams.set("dateTo", "2026-07-31");
    url.searchParams.set("userId", "admin-1");
    url.searchParams.set("spaceId", "space-1");

    const request = new Request(url.toString());
    const response = await GET(request);

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    const metadata = call["metadata"] as Record<string, unknown>;
    expect(metadata["filterTab"]).toBe("confirmed");
    expect(metadata["filterSearch"]).toBe("山田");
    expect(metadata["filterStartDate"]).toBe("2026-07-01");
    expect(metadata["filterEndDate"]).toBe("2026-07-31");
    expect(metadata["filterUserId"]).toBe("admin-1");
    expect(metadata["filterSpaceId"]).toBe("space-1");
  });

  test("spaceId のみを含む URL で filterSpaceId が記録される", async () => {
    const url = new URL("http://localhost/api/admin/export/reservations");
    url.searchParams.set("spaceId", "space-1");

    const request = new Request(url.toString());
    const response = await GET(request);

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    const metadata = call["metadata"] as Record<string, unknown>;
    expect(metadata["filterSpaceId"]).toBe("space-1");
  });

  test("dateFrom/dateTo のみを含む URL で filterStartDate/filterEndDate が記録される", async () => {
    const url = new URL("http://localhost/api/admin/export/reservations");
    url.searchParams.set("dateFrom", "2026-07-01");
    url.searchParams.set("dateTo", "2026-07-31");

    const request = new Request(url.toString());
    const response = await GET(request);

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    const metadata = call["metadata"] as Record<string, unknown>;
    expect(metadata["filterStartDate"]).toBe("2026-07-01");
    expect(metadata["filterEndDate"]).toBe("2026-07-31");
  });

  test("空の dateFrom/dateTo は audit metadata に含まれない", async () => {
    const url = new URL("http://localhost/api/admin/export/reservations");
    url.searchParams.set("dateFrom", "");
    url.searchParams.set("dateTo", "");

    const request = new Request(url.toString());
    const response = await GET(request);

    expect(response.status).toBe(200);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    const metadata = call["metadata"] as Record<string, unknown>;
    expect(metadata["filterStartDate"]).toBeUndefined();
    expect(metadata["filterEndDate"]).toBeUndefined();
  });

  test("権限不足時は audit を記録しない", async () => {
    mockCheckPermission.mockResolvedValueOnce({
      success: false,
      user: { id: "user-1" },
      error: { error: "Permission denied" },
    });

    const request = new Request(
      "http://localhost/api/admin/export/reservations",
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    await flushMicrotasks();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
