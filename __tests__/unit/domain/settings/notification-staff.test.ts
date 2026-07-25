import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetNotificationStaffCandidates = mock<
  () => Promise<
    Array<{ id: string; name: string; email: string; role: string }>
  >
>(() =>
  Promise.resolve([
    {
      id: "staff-1",
      name: "Admin User",
      email: "admin@example.com",
      role: "ADMIN",
    },
  ]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/users/queries", () => ({
  getNotificationStaffCandidates: mockGetNotificationStaffCandidates,
}));

import { assertAllowlistedNotificationStaffIds } from "@/shared/domain/settings/notification-staff";
import { DomainError } from "@/shared/domain/domain-error";

describe("assertAllowlistedNotificationStaffIds", () => {
  beforeEach(() => {
    mockGetNotificationStaffCandidates.mockClear();
    mockGetNotificationStaffCandidates.mockResolvedValue([
      {
        id: "staff-1",
        name: "Admin User",
        email: "admin@example.com",
        role: "ADMIN",
      },
    ]);
  });

  test("空配列はそのまま返す", async () => {
    await expect(assertAllowlistedNotificationStaffIds([])).resolves.toEqual(
      [],
    );
    expect(mockGetNotificationStaffCandidates).not.toHaveBeenCalled();
  });

  test("許可リスト内の ID はそのまま返す", async () => {
    await expect(
      assertAllowlistedNotificationStaffIds(["staff-1"]),
    ).resolves.toEqual(["staff-1"]);
  });

  test("許可外 ID が 1 件でも VALIDATION で reject", async () => {
    await expect(
      assertAllowlistedNotificationStaffIds(["staff-1", "tampered-id"]),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message:
        "通知先スタッフに選択できないユーザーが含まれています。ページを再読み込みしてから保存してください",
    } satisfies Partial<DomainError>);
  });
});
