import { beforeEach, describe, expect, mock, test } from "bun:test";

const checkPermissionMock = mock(() =>
  Promise.resolve({ success: true, user: { id: "admin-1" } }),
);
const getEventCheckInAttendeesMock = mock(() =>
  Promise.resolve({
    registrations: [
      {
        id: "60e01261-0546-4528-8a03-68d37a9d9568",
        name: "出席済み参加者",
        email: "attended@example.com",
        phone: "090-0000-0001",
        quantity: 2,
        attendedAt: new Date("2026-07-10T01:30:00.000Z"),
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        ticket: { id: "96e83639-0c13-4eb1-8de3-8e6fe7892ba9", name: "一般" },
      },
      {
        id: "6a95721c-bd35-4206-87fa-fa0102fb5f88",
        name: "未出席参加者",
        email: null,
        phone: null,
        quantity: 3,
        attendedAt: null,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        ticket: { id: "88b6a3c6-343c-49ab-8123-4e858cb7e913", name: "当日" },
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

  test("UUID の eventId で参加者一覧と quantity ベースの出欠集計を返す", async () => {
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "0baaa247-7a6c-4938-893c-a0a9c382b12b" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getEventCheckInAttendeesMock).toHaveBeenCalledWith(
      "0baaa247-7a6c-4938-893c-a0a9c382b12b",
    );

    const json = await response.json();
    expect(json).toMatchObject({
      totalRegistrations: 2,
      totalQuantity: 5,
      attendedQuantity: 2,
      registrations: [
        {
          id: "60e01261-0546-4528-8a03-68d37a9d9568",
          attendedAt: "2026-07-10T01:30:00.000Z",
          quantity: 2,
        },
        {
          id: "6a95721c-bd35-4206-87fa-fa0102fb5f88",
          attendedAt: null,
          quantity: 3,
        },
      ],
    });
  });

  test("不正な eventId は参加者 query に到達せず 400 を返す", async () => {
    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(getEventCheckInAttendeesMock).not.toHaveBeenCalled();
  });
});
