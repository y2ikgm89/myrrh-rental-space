import { describe, expect, test, mock, beforeEach } from "bun:test";

// Prisma tx mock: $queryRaw + customer.update の contract を pass-through で捕捉する。
// PR #992 Codex #3564968552 対応で `_sum: { totalPriceWithTax }` → `$queryRaw` with
// `SUM(COALESCE(totalPriceWithTax, totalPrice))` へ実装が変わったため、mock 経路も
// $queryRaw に揃える。

type StatsRow = {
  count: bigint;
  sum: number | null;
  first_created: Date | null;
  last_created: Date | null;
};

const mockQueryRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<StatsRow[]>
>(() =>
  Promise.resolve([
    { count: 0n, sum: null, first_created: null, last_created: null },
  ]),
);

const mockCustomerUpdate = mock<
  (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
    id: string;
  }>
>((args) => Promise.resolve({ id: args.where.id }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      mockQueryRaw(strings, ...values),
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
// unknown 経由の cast で narrow を明示的に緩める。
const tx = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
    mockQueryRaw(strings, ...values),
  customer: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      mockCustomerUpdate(args),
  },
} as unknown as Parameters<typeof recomputeCustomerReservationStats>[0];

describe("recomputeCustomerReservationStats", () => {
  beforeEach(() => {
    mockQueryRaw.mockClear();
    mockQueryRaw.mockImplementation(() =>
      Promise.resolve([
        { count: 0n, sum: null, first_created: null, last_created: null },
      ]),
    );
    mockCustomerUpdate.mockClear();
    mockCustomerUpdate.mockImplementation((args) =>
      Promise.resolve({ id: args.where.id }),
    );
  });

  test("$queryRaw は 1 度だけ叩かれ、customer.update に customerId が伝搬する", async () => {
    await recomputeCustomerReservationStats(tx, "cust-1");
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const call = mockCustomerUpdate.mock.calls[0];
    if (!call) throw new Error("customer.update was not called");
    expect(call[0].where.id).toBe("cust-1");
  });

  test("SQL は SUM(COALESCE(totalPriceWithTax, totalPrice)) と deletedAt IS NULL / customerId フィルタを含む (Codex #3564968552 fallback 契約)", async () => {
    await recomputeCustomerReservationStats(tx, "cust-1");
    const call = mockQueryRaw.mock.calls[0];
    if (!call) throw new Error("$queryRaw was not called");
    // template strings の raw parts を連結して SQL 本文の invariant を検証
    const strings = call[0];
    const sql = strings.join("?");

    expect(sql).toContain("COUNT(*)");
    // 核心: totalPriceWithTax 優先 + totalPrice fallback
    expect(sql).toContain('SUM(COALESCE("totalPriceWithTax", "totalPrice"))');
    expect(sql).toContain('MIN("createdAt")');
    expect(sql).toContain('MAX("createdAt")');
    expect(sql).toContain('FROM "reservations"');
    expect(sql).toContain('"customerId" =');
    expect(sql).toContain('"deletedAt" IS NULL');
  });

  test("$queryRaw の parameter bind に customerId が渡る (SQL injection 防止 = Prisma tagged-template)", async () => {
    await recomputeCustomerReservationStats(tx, "cust-abc");
    const call = mockQueryRaw.mock.calls[0];
    if (!call) throw new Error("$queryRaw was not called");
    // tagged-template の可変引数 (values) に customerId が入る
    expect(call.slice(1)).toContain("cust-abc");
  });

  test("予約 0 件: totalReservations=0, totalSpent=null, first/lastReservationAt=null", async () => {
    mockQueryRaw.mockImplementation(() =>
      Promise.resolve([
        { count: 0n, sum: null, first_created: null, last_created: null },
      ]),
    );
    await recomputeCustomerReservationStats(tx, "cust-empty");
    const call = mockCustomerUpdate.mock.calls[0];
    if (!call) throw new Error("customer.update was not called");
    const data = call[0].data;
    expect(data["totalReservations"]).toBe(0);
    expect(data["totalSpent"]).toBeNull();
    expect(data["firstReservationAt"]).toBeNull();
    expect(data["lastReservationAt"]).toBeNull();
  });

  test("予約複数件: bigint COUNT → number, float8 SUM → number (Decimal→number 転写)", async () => {
    const min = new Date("2020-05-10T00:00:00Z");
    const max = new Date("2027-01-15T00:00:00Z");
    mockQueryRaw.mockImplementation(() =>
      Promise.resolve([
        {
          count: 3n, // Postgres COUNT(*)::bigint
          sum: 30000, // Postgres SUM(...)::float8
          first_created: min,
          last_created: max,
        },
      ]),
    );
    await recomputeCustomerReservationStats(tx, "cust-active");
    const data = mockCustomerUpdate.mock.calls[0]?.[0].data;
    if (!data) throw new Error("customer.update was not called");
    expect(data["totalReservations"]).toBe(3);
    expect(data["totalSpent"]).toBe(30000);
    expect(data["firstReservationAt"]).toBe(min);
    expect(data["lastReservationAt"]).toBe(max);
  });

  test("totalSpent は falsy (0 / null) を null に統一する — Customer.totalSpent 列 と一致", async () => {
    // 予約は存在するが全て 0 円 (無料予約 or 割引で 0 円) の場合、
    // 集計結果の 0 は Customer.totalSpent 列と一致するよう null に折りたたむ。
    mockQueryRaw.mockImplementation(() =>
      Promise.resolve([
        {
          count: 2n,
          sum: 0,
          first_created: new Date(),
          last_created: new Date(),
        },
      ]),
    );
    await recomputeCustomerReservationStats(tx, "cust-zero-price");
    const data = mockCustomerUpdate.mock.calls[0]?.[0].data;
    if (!data) throw new Error("customer.update was not called");
    expect(data["totalSpent"]).toBeNull();
  });

  test("$queryRaw が空配列を返した pathological ケース: totalReservations=0 (defensive fallback)", async () => {
    // Postgres は SELECT ... FROM ... WHERE ... で集計クエリなら常に 1 行を返すが、
    // mock 契約の defensive テスト。0 行にも安全に fallback する。
    mockQueryRaw.mockImplementation(() => Promise.resolve([]));
    await recomputeCustomerReservationStats(tx, "cust-no-row");
    const data = mockCustomerUpdate.mock.calls[0]?.[0].data;
    if (!data) throw new Error("customer.update was not called");
    expect(data["totalReservations"]).toBe(0);
    expect(data["totalSpent"]).toBeNull();
    expect(data["firstReservationAt"]).toBeNull();
    expect(data["lastReservationAt"]).toBeNull();
  });
});
