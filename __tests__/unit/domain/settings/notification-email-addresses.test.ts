import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockSettingsNotificationFindUnique = mock<
  () => Promise<{
    notificationEmailAddresses: string[];
    notificationStaffIds: string[];
  } | null>
>(() =>
  Promise.resolve({
    notificationEmailAddresses: ["custom@example.com"],
    notificationStaffIds: ["staff-1", "demoted-id"],
  }),
);

const mockUserFindMany = mock<() => Promise<Array<{ email: string }>>>(() =>
  Promise.resolve([{ email: "admin@example.com" }]),
);

mock.module("server-only", () => ({}));

mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsNotification: {
      findUnique: mockSettingsNotificationFindUnique,
    },
    user: {
      findMany: mockUserFindMany,
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

import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";

describe("getNotificationEmailAddresses", () => {
  beforeEach(() => {
    mockSettingsNotificationFindUnique.mockClear();
    mockUserFindMany.mockClear();
  });

  test("スタッフ解決は DASHBOARD_ROLES 条件付き findMany で fail-closed", async () => {
    const emails = await getNotificationEmailAddresses();

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["staff-1", "demoted-id"] },
          role: { in: expect.arrayContaining(["SUPER_ADMIN", "ADMIN"]) },
        }),
      }),
    );
    expect(emails).toEqual(["admin@example.com", "custom@example.com"]);
  });
});
