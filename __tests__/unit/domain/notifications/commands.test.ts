import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockCreate = mock(() => Promise.resolve({ id: "test-id" }));
const mockUpdate = mock(() => Promise.resolve({ id: "test-id", isRead: true }));
const mockUpdateMany = mock(() => Promise.resolve({ count: 5 }));
const mockDelete = mock(() => Promise.resolve({ id: "test-id" }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    adminNotification: {
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
      delete: mockDelete,
    },
  },
}));

mock.module("server-only", () => ({}));

const {
  createNotificationCommand,
  markAsReadCommand,
  markAllAsReadCommand,
  deleteNotificationCommand,
} = await import("@/shared/domain/notifications/commands");

describe("createNotificationCommand", () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  test("creates notification with all fields", async () => {
    await createNotificationCommand({
      type: "reservation_new",
      title: "新規予約",
      message: "テスト太郎様が予約しました",
      resourceType: "reservation",
      resourceId: "res-123",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "reservation_new",
        title: "新規予約",
        message: "テスト太郎様が予約しました",
        resourceType: "reservation",
        resourceId: "res-123",
      }),
    });
  });

  test("creates notification without optional fields", async () => {
    await createNotificationCommand({
      type: "inquiry_new",
      title: "新規お問い合わせ",
      message: "お問い合わせがありました",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        type: "inquiry_new",
        title: "新規お問い合わせ",
        message: "お問い合わせがありました",
      },
    });
  });
});

describe("markAsReadCommand", () => {
  beforeEach(() => {
    mockUpdate.mockClear();
  });

  test("marks single notification as read", async () => {
    await markAsReadCommand("notif-1");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { isRead: true },
    });
  });
});

describe("markAllAsReadCommand", () => {
  beforeEach(() => {
    mockUpdateMany.mockClear();
  });

  test("marks all unread notifications as read", async () => {
    await markAllAsReadCommand();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { isRead: false },
      data: { isRead: true },
    });
  });
});

describe("deleteNotificationCommand", () => {
  beforeEach(() => {
    mockDelete.mockClear();
  });

  test("deletes notification by id", async () => {
    await deleteNotificationCommand("notif-1");

    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: "notif-1" },
    });
  });
});
