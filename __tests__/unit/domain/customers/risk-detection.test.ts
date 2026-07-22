import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockFindUnique =
  mock<(args: unknown) => Promise<{ flagReasons: string[] } | null>>();
const mockUpdateMany = mock<(args: unknown) => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);
// customerId 単位の advisory lock (728358) 取得。tagged template 呼出しの
// mock はテンプレート文字列 + 値配列を受け取れれば十分なので戻り値だけ返す。
const mockExecuteRaw = mock(() => Promise.resolve(0));
const mockTransaction = mock(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    customer: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
    $executeRaw: mockExecuteRaw,
  }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: mockTransaction },
}));

const { reconcileFlagReasonsCommand } =
  await import("@/shared/domain/customers/risk-detection");

describe("reconcileFlagReasonsCommand", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockExecuteRaw.mockClear();
  });

  test("他cron所有の理由コードを温存しつつ自分の所有分だけ書き換える", async () => {
    mockFindUnique.mockResolvedValue({
      flagReasons: ["rapid_booking", "DUPLICATE_CANDIDATE"],
    });

    await reconcileFlagReasonsCommand("customer-1", {
      ownedReasons: [
        "rapid_booking",
        "frequent_cancellation",
        "repeated_no_show",
      ],
      detectedReasons: ["frequent_cancellation"],
    });

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          flagReasons: expect.arrayContaining([
            "DUPLICATE_CANDIDATE",
            "frequent_cancellation",
          ]),
        }),
      }),
    );
    const call = mockUpdateMany.mock.calls[0]?.[0] as {
      data: { flagReasons: string[] };
    };
    expect(call.data.flagReasons).not.toContain("rapid_booking");
    expect(call.data.flagReasons.length).toBe(2);
  });

  test("最終的な flagReasons が空になれば flaggedForReviewAt も null にする", async () => {
    mockFindUnique.mockResolvedValue({ flagReasons: ["rapid_booking"] });

    await reconcileFlagReasonsCommand("customer-1", {
      ownedReasons: [
        "rapid_booking",
        "frequent_cancellation",
        "repeated_no_show",
      ],
      detectedReasons: [],
    });

    const call = mockUpdateMany.mock.calls[0]?.[0] as {
      data: { flagReasons: string[]; flaggedForReviewAt: Date | null };
    };
    expect(call.data.flagReasons).toEqual([]);
    expect(call.data.flaggedForReviewAt).toBeNull();
  });

  test("存在しない顧客IDは何もせず 0 を返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await reconcileFlagReasonsCommand("nonexistent", {
      ownedReasons: ["rapid_booking"],
      detectedReasons: ["rapid_booking"],
    });

    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
