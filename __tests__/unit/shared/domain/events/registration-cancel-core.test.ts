import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@generated/prisma/enums";
import {
  applyEventRegistrationCancellation,
  type ApplyEventRegistrationCancellationOptions,
} from "@/shared/domain/events/registration-cancel-core";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";

const mockUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
// offerNextWaitlistEntryCommand の FIFO 候補検索用（CONFIRMED 由来のキャンセルでのみ呼ばれる）
const mockFindFirst = mock<
  (
    args: Record<string, unknown>,
  ) => Promise<{ id: string; email: string | null } | null>
>(() => Promise.resolve(null));
// ApplyEventRegistrationCancellationTx の構造要件を満たすためのスタブ（実装は呼ばない）
const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{
    id: string;
    email: string | null;
    offeredAt: Date | null;
    expiresAt: Date | null;
  } | null>
>(() => Promise.resolve(null));

const mockTx = {
  eventRegistration: {
    updateMany: mockUpdateMany,
    findFirst: mockFindFirst,
    findUnique: mockFindUnique,
  },
};

const NOW = new Date("2026-04-01T00:00:00Z");

/** slotId/ticketId は offerNextWaitlistEntryCommand が候補検索に使う。 */
const BASE_REGISTRATION = { id: "reg1", slotId: "slot1", ticketId: "ticket1" };

function customerMypageOptions(
  overrides: Partial<ApplyEventRegistrationCancellationOptions> = {},
): ApplyEventRegistrationCancellationOptions {
  return {
    now: NOW,
    cancelledByType: CANCELLED_BY.CUSTOMER_MYPAGE,
    ...overrides,
  };
}

describe("applyEventRegistrationCancellation", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue(null); // 既定: waitlist 候補なし
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValue(null);
  });

  test("CONFIRMED なら CANCELLED に atomic claim して success（waitlist 候補なしなら promoted: null）", async () => {
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    expect(result).toEqual({
      success: true,
      previousStatus: RegistrationStatus.CONFIRMED,
      promoted: null,
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg1",
          status: {
            in: expect.arrayContaining([RegistrationStatus.CONFIRMED]),
          },
        }),
        data: expect.objectContaining({
          status: RegistrationStatus.CANCELLED,
          cancelledAt: NOW,
          cancelledByType: CANCELLED_BY.CUSTOMER_MYPAGE,
          icsSequence: { increment: 1 },
        }),
      }),
    );
    // CONFIRMED 由来のキャンセルなので offerNextWaitlistEntryCommand が同一 tx 上で呼ばれる
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slotId: "slot1",
          ticketId: "ticket1",
          status: RegistrationStatus.WAITLISTED,
        }),
      }),
    );
  });

  test("CONFIRMED キャンセルで waitlist 候補が居れば promoted に反映される", async () => {
    mockFindFirst.mockResolvedValue({ id: "waiter1", email: "w@example.com" });

    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.promoted).toEqual({
        id: "waiter1",
        email: "w@example.com",
        offeredAt: NOW,
        expiresAt: expect.any(Date),
      });
    }
    // 昇格の claim も同じ updateMany 経由（2 回目の呼び出し）
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  test("WAITLISTED も自己キャンセルできる（枠を消費していないため promote 対象外）", async () => {
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.WAITLISTED },
      customerMypageOptions(),
    );

    expect(result).toEqual({
      success: true,
      previousStatus: RegistrationStatus.WAITLISTED,
      promoted: null,
    });
    // CONFIRMED 由来でないため offerNextWaitlistEntryCommand は呼ばれない
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  test("WAITLISTED_OFFERED も自己キャンセルできる（promote 対象外）", async () => {
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.WAITLISTED_OFFERED },
      customerMypageOptions(),
    );

    expect(result).toEqual({
      success: true,
      previousStatus: RegistrationStatus.WAITLISTED_OFFERED,
      promoted: null,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("CUSTOMER_TOKEN / ADMIN を渡すと cancelledByType にそのまま流れる", async () => {
    await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      { now: NOW, cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN },
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
        }),
      }),
    );

    await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      { now: NOW, cancelledByType: CANCELLED_BY.ADMIN },
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelledByType: CANCELLED_BY.ADMIN }),
      }),
    );
  });

  test("既に CANCELLED ならエラーで更新しない", async () => {
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CANCELLED },
      customerMypageOptions(),
    );

    expect(result).toEqual({
      success: false,
      error: "この申込はキャンセルできません",
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("atomic claim が count=0 なら race を error として返す", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("別の操作");
    }
    // claim に失敗しているため promote chain には到達しない
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("expectedCustomerId 省略時は WHERE に customerId を含めない", async () => {
    await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    const call = mockUpdateMany.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(Object.hasOwn((call as { where: object }).where, "customerId")).toBe(
      false,
    );
  });

  test("expectedCustomerId 指定時は WHERE に customerId を含める（claim との race 対策）", async () => {
    await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      {
        now: NOW,
        cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
        expectedCustomerId: null,
      },
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: null }),
      }),
    );

    await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      {
        now: NOW,
        cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
        expectedCustomerId: "cust-1",
      },
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: "cust-1" }),
      }),
    );
  });

  test("expectedCustomerId が claim で書き換わっていれば count=0 で race error", async () => {
    // claimEventRegistrationForCustomer が customerId を書き換えた後の状態を
    // updateMany の WHERE (customerId: null) がヒットせず count=0 になる想定。
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { ...BASE_REGISTRATION, status: RegistrationStatus.CONFIRMED },
      {
        now: NOW,
        cancelledByType: CANCELLED_BY.CUSTOMER_TOKEN,
        expectedCustomerId: null,
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("別の操作");
    }
  });
});
