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

const mockTx = {
  eventRegistration: { updateMany: mockUpdateMany },
};

const NOW = new Date("2026-04-01T00:00:00Z");

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
  });

  test("CONFIRMED なら CANCELLED に atomic claim して success", async () => {
    const result = await applyEventRegistrationCancellation(
      mockTx,
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    expect(result).toEqual({ success: true });
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
  });

  test("CUSTOMER_TOKEN / ADMIN を渡すと cancelledByType にそのまま流れる", async () => {
    await applyEventRegistrationCancellation(
      mockTx,
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
      { id: "reg1", status: RegistrationStatus.CANCELLED },
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
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
      customerMypageOptions(),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("別の操作");
    }
  });

  test("expectedCustomerId 省略時は WHERE に customerId を含めない", async () => {
    await applyEventRegistrationCancellation(
      mockTx,
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
      { id: "reg1", status: RegistrationStatus.CONFIRMED },
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
