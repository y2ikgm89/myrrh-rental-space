import { describe, expect, test, mock, beforeEach } from "bun:test";

// Prisma tx mock: aggregate + customer.update の contract を pass-through で捕捉する。

type AggregateResult = {
  _count: number;
  _sum: { totalPriceWithTax: number | null };
  _min: { createdAt: Date | null };
  _max: { createdAt: Date | null };
};

type MockArgs = Record<string, unknown> | undefined;

const mockAggregate = mock<(args?: MockArgs) => Promise<AggregateResult>>(() =>
  Promise.resolve({
    _count: 0,
    _sum: { totalPriceWithTax: null },
    _min: { createdAt: null },
    _max: { createdAt: null },
  }),
);
const mockCustomerUpdate = mock<
  (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
    id: string;
  }>
>((args) => Promise.resolve({ id: args.where.id }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { aggregate: (args?: MockArgs) => mockAggregate(args) },
    customer: {
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => mockCustomerUpdate(args),
    },
  },
}));

const { recomputeCustomerReservationStats } =
  await import("@/shared/domain/reservations/payloads");

// テスト用の tx は「prisma と同じ shape」に見えれば良い — mock 経由でルーティングされる。
// Prisma tx 型は 40+ model の method を含み、mock 側で全て埋めるのは実用的でないため
// unknown 経由の cast で narrow を明示的に緩める (テスト側の割り切り)。
const tx = {
  reservation: {
    aggregate: (args?: MockArgs) => mockAggregate(args),
  },
  customer: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      mockCustomerUpdate(args),
  },
} as unknown as Parameters<typeof recomputeCustomerReservationStats>[0];

describe("recomputeCustomerReservationStats", () => {
  beforeEach(() => {
    mockAggregate.mockClear();
    mockAggregate.mockImplementation(() =>
      Promise.resolve({
        _count: 0,
        _sum: { totalPriceWithTax: null },
        _min: { createdAt: null },
        _max: { createdAt: null },
      }),
    );
    mockCustomerUpdate.mockClear();
    mockCustomerUpdate.mockImplementation((args) =>
      Promise.resolve({ id: args.where.id }),
    );
  });

  test("aggregate は deletedAt: null のみを対象にする (soft-delete 除外)", async () => {
    await recomputeCustomerReservationStats(tx, "cust-1");
    const call = mockAggregate.mock.calls[0];
    if (!call) throw new Error("aggregate was not called");
    const args = call[0] as {
      where: { customerId: string; deletedAt: null };
      _count: true;
      _sum: { totalPriceWithTax: true };
      _min: { createdAt: true };
      _max: { createdAt: true };
    };
    expect(args.where.customerId).toBe("cust-1");
    expect(args.where.deletedAt).toBeNull();
    expect(args._sum.totalPriceWithTax).toBe(true);
    expect(args._min.createdAt).toBe(true);
    expect(args._max.createdAt).toBe(true);
  });

  test("予約 0 件: totalReservations=0, totalSpent=null, first/lastReservationAt=null", async () => {
    mockAggregate.mockImplementation(() =>
      Promise.resolve({
        _count: 0,
        _sum: { totalPriceWithTax: null },
        _min: { createdAt: null },
        _max: { createdAt: null },
      }),
    );
    await recomputeCustomerReservationStats(tx, "cust-empty");
    const call = mockCustomerUpdate.mock.calls[0];
    if (!call) throw new Error("customer.update was not called");
    expect(call[0].where.id).toBe("cust-empty");
    const data = call[0].data;
    expect(data["totalReservations"]).toBe(0);
    expect(data["totalSpent"]).toBeNull();
    expect(data["firstReservationAt"]).toBeNull();
    expect(data["lastReservationAt"]).toBeNull();
  });

  test("予約複数件: SUM(totalPriceWithTax) が number として書き込まれる (Decimal → number)", async () => {
    const min = new Date("2020-05-10T00:00:00Z");
    const max = new Date("2027-01-15T00:00:00Z");
    mockAggregate.mockImplementation(() =>
      Promise.resolve({
        _count: 3,
        // Prisma Decimal aggregate は number として届く (createAppPrismaClient 拡張)
        _sum: { totalPriceWithTax: 30000 },
        _min: { createdAt: min },
        _max: { createdAt: max },
      }),
    );
    await recomputeCustomerReservationStats(tx, "cust-active");
    const call = mockCustomerUpdate.mock.calls[0];
    if (!call) throw new Error("customer.update was not called");
    const data = call[0].data;
    expect(data["totalReservations"]).toBe(3);
    expect(data["totalSpent"]).toBe(30000);
    expect(data["firstReservationAt"]).toBe(min);
    expect(data["lastReservationAt"]).toBe(max);
  });

  test("totalSpent は falsy (0 / null) を null に統一する — Customer.totalSpent 列 と一致", async () => {
    // 予約は存在するが全て totalPriceWithTax=0 (無料予約 or 割引で 0 円) の場合、
    // 集計結果の 0 は Customer.totalSpent 列と一致するよう null に折りたたむ。
    mockAggregate.mockImplementation(() =>
      Promise.resolve({
        _count: 2,
        _sum: { totalPriceWithTax: 0 },
        _min: { createdAt: new Date() },
        _max: { createdAt: new Date() },
      }),
    );
    await recomputeCustomerReservationStats(tx, "cust-zero-price");
    const data = mockCustomerUpdate.mock.calls[0]?.[0].data;
    if (!data) throw new Error("customer.update was not called");
    expect(data["totalSpent"]).toBeNull();
  });
});
