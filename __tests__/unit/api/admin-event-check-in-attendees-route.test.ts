import { beforeEach, describe, expect, mock, test } from "bun:test";

const checkPermissionMock = mock(() =>
  Promise.resolve({ success: true, user: { id: "admin-1" } }),
);
const getEventCheckInAttendeesMock = mock(() =>
  Promise.resolve({
    registrations: [
      {
        id: "cm0reg12345678901234567",
        name: "出席済み参加者",
        email: "attended@example.com",
        phone: "090-0000-0001",
        quantity: 2,
        attendedAt: new Date("2026-07-10T01:30:00.000Z"),
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        ticket: { id: "cm0ticket1234567890123", name: "一般" },
      },
      {
        id: "cm0reg98765432109876543",
        name: "未出席参加者",
        email: null,
        phone: null,
        quantity: 3,
        attendedAt: null,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        ticket: { id: "cm0ticket9876543210987", name: "当日" },
      },
    ],
    totalRegistrations: 2,
    totalQuantity: 5,
    attendedQuantity: 2,
  }),
);

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof checkPermissionMock>) =>
    checkPermissionMock(...args),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventCheckInAttendees: (
    ...args: Parameters<typeof getEventCheckInAttendeesMock>
  ) => getEventCheckInAttendeesMock(...args),
}));

const { GET } =
  await import("@/app/api/admin/events/[id]/check-in/attendees/route");

describe("GET /api/admin/events/[id]/check-in/attendees", () => {
  beforeEach(() => {
    checkPermissionMock.mockClear();
    getEventCheckInAttendeesMock.mockClear();
  });

  test("CUID の eventId で参加者一覧と quantity ベースの出欠集計を返す", async () => {
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "cm0event1234567890123456" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getEventCheckInAttendeesMock).toHaveBeenCalledWith(
      "cm0event1234567890123456",
    );

    const json = await response.json();
    expect(json).toMatchObject({
      totalRegistrations: 2,
      totalQuantity: 5,
      attendedQuantity: 2,
      registrations: [
        {
          id: "cm0reg12345678901234567",
          attendedAt: "2026-07-10T01:30:00.000Z",
          quantity: 2,
        },
        {
          id: "cm0reg98765432109876543",
          attendedAt: null,
          quantity: 3,
        },
      ],
    });
  });

  test("不正な eventId は参加者 query に到達せず 400 を返す", async () => {
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "not-a-cuid" }),
    });

    expect(response.status).toBe(400);
    expect(getEventCheckInAttendeesMock).not.toHaveBeenCalled();
  });
});
