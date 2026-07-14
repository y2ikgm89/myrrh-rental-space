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
// ApplyEventRegistrationCancellationTx の構造要件を満たすためのスタブ（実装は呼ばない）
const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));
// cancelEventRegistrationWithClaim が applyEventRegistrationCancellation 呼び出し前に
// advisory lock 728350 を取得する $executeRaw のスタブ（戻り値の影響行数は使わない）。
const mockExecuteRaw = mock<(...args: unknown[]) => Promise<number>>(() =>
  Promise.resolve(0),
);

const mockTx = {
  eventRegistration: {
    findFirst: mockFindFirst,
    updateMany: mockUpdateMany,
    findUniqueOrThrow: mockFindUniqueOrThrow,
    findUnique: mockFindUnique,
  },
  $executeRaw: mockExecuteRaw,
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
  slotId: "slot1",
  ticketId: "ticket1",
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
  mockFindUnique.mockReset();
  mockExecuteRaw.mockReset();
  // 既定は「見つからない」。findFirst は (1) cancel 対象の申込検索と (2) REG が
  // CONFIRMED の場合に applyEventRegistrationCancellation が内部で呼ぶ
  // offerNextWaitlistEntryCommand の waitlist 候補検索の 2 用途で共有される。
  // 各テストは 1 回目の呼び出し用に mockResolvedValueOnce(REG) を積む前提とし、
  // 2 回目以降（waitlist 候補検索）はこの既定値 null（候補なし）にフォールバックする。
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockFindUniqueOrThrow.mockResolvedValue({ icsSequence: 1 });
  mockFindUnique.mockResolvedValue(null);
  mockExecuteRaw.mockResolvedValue(0);
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
    mockFindFirst.mockResolvedValueOnce(REG);
    const result = await cancelEventRegistrationByToken("reg1");
    // CONFIRMED 由来のキャンセルだが waitlist 候補なし（既定 null）のため promoted: null
    expect(result).toEqual({ ...REG, icsSequence: 1, promoted: null });
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
    mockFindFirst.mockResolvedValueOnce(REG);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(cancelEventRegistrationByToken("reg1")).rejects.toThrow(
      DomainError,
    );
  });
});

describe("cancelEventRegistrationCommand（会員マイページ・所有権フィルタあり）", () => {
  beforeEach(resetMocks);

  test("customerId フィルタを掛けて検索し CUSTOMER_MYPAGE を記録", async () => {
    mockFindFirst.mockResolvedValueOnce(REG);
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
    mockFindFirst.mockResolvedValueOnce(REG);
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
