/**
 * getNotificationEmailAddresses のスタッフ解決フィルタ
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DASHBOARD_ROLES } from "@/shared/lib/admin-roles";

const STAFF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STALE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type UserFindManyArgs = {
  where?: {
    id?: { in?: string[] };
    role?: { in?: string[] };
  };
  select?: { email?: boolean };
};

const mockUserFindMany = mock<
  (args: UserFindManyArgs) => Promise<{ email: string }[]>
>(() => Promise.resolve([]));
const mockSettingsNotificationFindUnique = mock(() =>
  Promise.resolve({
    notificationEmailAddresses: ["custom@example.com"],
    notificationStaffIds: [STAFF_ID, STALE_ID],
  }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
    },
    settingsNotification: {
      findUnique: mockSettingsNotificationFindUnique,
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

const { getNotificationEmailAddresses } =
  await import("@/shared/domain/settings/queries/notification");

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
