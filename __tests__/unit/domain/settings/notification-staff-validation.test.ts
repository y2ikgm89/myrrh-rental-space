/**
 * 通知先スタッフ ID のロール検証（updateEmailSettings / getNotificationEmailAddresses）
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { DASHBOARD_ROLES } from "@/shared/lib/admin-roles";
import { DomainError } from "@/shared/domain/domain-error";

const STAFF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STALE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type UserFindManyArgs = {
  where?: {
    id?: { in?: string[] };
    dashboardEnabled?: boolean;
    role?: { in?: Role[] };
  };
  select?: { email?: boolean; id?: boolean };
};

const mockUserFindMany = mock<
  (args: UserFindManyArgs) => Promise<{ email?: string; id?: string }[]>
>(() => Promise.resolve([]));
const mockSettingsNotificationFindUnique = mock(() =>
  Promise.resolve({
    notificationEmailAddresses: ["custom@example.com"],
    notificationStaffIds: [STAFF_ID, STALE_ID],
  }),
);
const mockSettingsOrganizationUpsert = mock(() =>
  Promise.resolve({ id: "singleton" }),
);
const mockSettingsReservationUpsert = mock(() =>
  Promise.resolve({ id: "singleton" }),
);
const mockSettingsNotificationUpsert = mock(() =>
  Promise.resolve({ id: "singleton" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
    },
    settingsOrganization: {
      upsert: mockSettingsOrganizationUpsert,
    },
    settingsReservation: {
      upsert: mockSettingsReservationUpsert,
    },
    settingsNotification: {
      findUnique: mockSettingsNotificationFindUnique,
      upsert: mockSettingsNotificationUpsert,
    },
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
  safeFetch: async <T>({
    fetch,
    fallback,
  }: {
    fetch: () => Promise<T>;
    fallback: T;
  }) => {
    try {
      return await fetch();
    } catch {
      return fallback;
    }
  },
}));

const { updateEmailSettings } =
  await import("@/shared/domain/settings/commands");
const { getNotificationEmailAddresses } =
  await import("@/shared/domain/settings/queries/notification");

const EMAIL_INPUT = {
  senderEmail: null,
  senderName: null,
  replyToEmail: null,
  sendReservationConfirmationEmail: true,
  notifyEventReminder: false,
  notificationStaffIds: [] as string[],
  notificationEmailAddresses: [] as string[],
};

describe("updateEmailSettings notificationStaffIds", () => {
  beforeEach(() => {
    mockUserFindMany.mockClear();
    mockSettingsOrganizationUpsert.mockClear();
    mockSettingsReservationUpsert.mockClear();
    mockSettingsNotificationUpsert.mockClear();
  });

  test("空配列は upsert を通し、User.findMany を呼ばない", async () => {
    await updateEmailSettings({
      ...EMAIL_INPUT,
      notificationStaffIds: [],
    });

    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSettingsNotificationUpsert).toHaveBeenCalledTimes(1);
  });

  test("管理ロールのスタッフのみなら保存する", async () => {
    mockUserFindMany.mockImplementationOnce(() =>
      Promise.resolve([{ id: STAFF_ID }]),
    );

    await updateEmailSettings({
      ...EMAIL_INPUT,
      notificationStaffIds: [STAFF_ID],
    });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [STAFF_ID] },
        dashboardEnabled: true,
        role: { in: [...DASHBOARD_ROLES] },
      },
      select: { id: true },
    });
    expect(mockSettingsNotificationUpsert).toHaveBeenCalledTimes(1);
  });

  test("非スタッフ / 欠損 ID は DomainError VALIDATION", async () => {
    mockUserFindMany.mockImplementationOnce(() => Promise.resolve([]));

    let error: unknown;
    try {
      await updateEmailSettings({
        ...EMAIL_INPUT,
        notificationStaffIds: [STALE_ID],
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("VALIDATION");
    expect((error as DomainError).message).toContain("通知先スタッフ");
    expect(mockSettingsNotificationUpsert).not.toHaveBeenCalled();
  });
});

describe("getNotificationEmailAddresses role filter", () => {
  beforeEach(() => {
    mockUserFindMany.mockClear();
    mockSettingsNotificationFindUnique.mockClear();
  });

  test("スタッフ解決時に DASHBOARD_ROLES で絞り込む", async () => {
    mockUserFindMany.mockImplementationOnce(() =>
      Promise.resolve([{ email: "staff@example.com" }]),
    );

    const emails = await getNotificationEmailAddresses();

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [STAFF_ID, STALE_ID] },
        role: { in: [...DASHBOARD_ROLES] },
      },
      select: { email: true },
    });
    expect(emails).toContain("staff@example.com");
    expect(emails).toContain("custom@example.com");
  });
});
