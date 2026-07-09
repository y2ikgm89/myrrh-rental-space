import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@generated/prisma/enums";

const mockFindFirst = mock<(args: Record<string, unknown>) => Promise<unknown>>(
  () => Promise.resolve(null),
);
const mockUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ count: 1 }));
const mockFindUniqueOrThrow = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ icsSequence: 1 }));

const mockTx = {
  eventRegistration: {
    findFirst: mockFindFirst,
    updateMany: mockUpdateMany,
    findUniqueOrThrow: mockFindUniqueOrThrow,
  },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => cb(mockTx),
  },
}));

import {
  cancelEventRegistrationCommand,
  adminCancelEventRegistrationCommand,
  cancelEventRegistrationByToken,
} from "@/shared/domain/events/registration-commands";
import { DomainError } from "@/shared/domain/domain-error";

const REG = {
  id: "reg1",
  eventId: "evt1",
  name: "山田太郎",
  email: "test@example.com",
  quantity: 2,
  status: RegistrationStatus.CONFIRMED,
  event: { title: "夏祭り", slug: "summer-fes" },
};

function resetMocks() {
  mockFindFirst.mockReset();
  mockUpdateMany.mockReset();
  mockFindUniqueOrThrow.mockReset();
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFindUniqueOrThrow.mockResolvedValue({ icsSequence: 1 });
}

describe("cancelEventRegistrationByToken（ゲスト・所有権フィルタなし）", () => {
  beforeEach(resetMocks);

  test("申込が見つからなければ DomainError(NOT_FOUND)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(cancelEventRegistrationByToken("reg1")).rejects.toThrow(
      DomainError,
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("customerId フィルタなしで検索し CUSTOMER_TOKEN を記録", async () => {
    mockFindFirst.mockResolvedValue(REG);
    const result = await cancelEventRegistrationByToken("reg1");
    expect(result).toEqual({ ...REG, icsSequence: 1 });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg1", event: { deletedAt: null } },
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelledByType: "CUSTOMER_TOKEN" }),
      }),
    );
  });

  test("atomic claim が失敗すれば DomainError(CONFLICT)", async () => {
    mockFindFirst.mockResolvedValue(REG);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(cancelEventRegistrationByToken("reg1")).rejects.toThrow(
      DomainError,
    );
  });
});

describe("cancelEventRegistrationCommand（会員マイページ・所有権フィルタあり）", () => {
  beforeEach(resetMocks);

  test("customerId フィルタを掛けて検索し CUSTOMER_MYPAGE を記録", async () => {
    mockFindFirst.mockResolvedValue(REG);
    await cancelEventRegistrationCommand("reg1", "cust1");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "reg1",
          customerId: "cust1",
          event: { deletedAt: null },
        },
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelledByType: "CUSTOMER_MYPAGE" }),
      }),
    );
  });
});

describe("adminCancelEventRegistrationCommand（管理者・所有権フィルタなし）", () => {
  beforeEach(resetMocks);

  test("所有権フィルタなしで検索し ADMIN を記録", async () => {
    mockFindFirst.mockResolvedValue(REG);
    await adminCancelEventRegistrationCommand("reg1");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reg1", event: { deletedAt: null } },
      }),
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelledByType: "ADMIN" }),
      }),
    );
  });
});
