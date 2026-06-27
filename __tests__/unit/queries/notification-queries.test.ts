import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockRequireAdminPermission = mock(async () => ({
  id: "admin-user",
  role: "ADMIN",
}));
const mockGetNotificationsQuery = mock(async () => ({
  notifications: [],
  total: 0,
  page: 1,
  perPage: 20,
  totalPages: 0,
}));
const mockGetUnreadCountQuery = mock(async () => 0);
const mockGetRecentNotificationsQuery = mock(async () => []);

mock.module("@/admin/queries/_helpers", () => ({
  requireAdminDashboardAccess: (
    ...args: Parameters<typeof mockRequireAdminPermission>
  ) => mockRequireAdminPermission(...args),
  requireAdminPermission: (
    ...args: Parameters<typeof mockRequireAdminPermission>
  ) => mockRequireAdminPermission(...args),
}));

mock.module("@/shared/domain/notifications/admin-queries", () => ({
  getNotificationsQuery: (
    ...args: Parameters<typeof mockGetNotificationsQuery>
  ) => mockGetNotificationsQuery(...args),
  getUnreadCountQuery: (...args: Parameters<typeof mockGetUnreadCountQuery>) =>
    mockGetUnreadCountQuery(...args),
  getRecentNotificationsQuery: (
    ...args: Parameters<typeof mockGetRecentNotificationsQuery>
  ) => mockGetRecentNotificationsQuery(...args),
}));

const { getNotifications, getUnreadNotificationCount, getRecentNotifications } =
  await import("@/admin/queries/notification");

describe("admin notification query wrappers", () => {
  beforeEach(() => {
    mockRequireAdminPermission.mockClear();
    mockGetNotificationsQuery.mockClear();
    mockGetUnreadCountQuery.mockClear();
    mockGetRecentNotificationsQuery.mockClear();
  });

  test("一覧取得は notification:read を要求する", async () => {
    await getNotifications({ page: 1, perPage: 20 });

    expect(mockRequireAdminPermission).toHaveBeenCalledWith(
      "notification",
      "read",
    );
    expect(mockGetNotificationsQuery).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
    });
  });

  test("未読数と最近の通知も notification:read を要求する", async () => {
    await getUnreadNotificationCount();
    await getRecentNotifications(5);

    expect(mockRequireAdminPermission).toHaveBeenNthCalledWith(
      1,
      "notification",
      "read",
    );
    expect(mockRequireAdminPermission).toHaveBeenNthCalledWith(
      2,
      "notification",
      "read",
    );
    expect(mockGetUnreadCountQuery).toHaveBeenCalled();
    expect(mockGetRecentNotificationsQuery).toHaveBeenCalledWith(5);
  });
});
