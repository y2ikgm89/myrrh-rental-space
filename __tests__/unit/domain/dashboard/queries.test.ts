import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

type PrismaWhereArg = {
  where?: {
    deletedAt?: null;
    createdAt?: { gte?: Date; lt?: Date; lte?: Date };
    startTime?: { gte?: Date; lt?: Date; lte?: Date };
    status?: unknown;
    [key: string]: unknown;
  };
  take?: number;
  orderBy?: unknown;
  select?: unknown;
  _sum?: unknown;
};

const mockReservationCount = mock((_args?: PrismaWhereArg): Promise<number> =>
  Promise.resolve(0),
);
const mockReservationAggregate = mock(
  (_args?: PrismaWhereArg): Promise<{ _sum: { totalPrice: number | null } }> =>
    Promise.resolve({ _sum: { totalPrice: null } }),
);
const mockReservationFindMany = mock(
  (_args?: PrismaWhereArg): Promise<unknown[]> => Promise.resolve([]),
);
const mockInquiryCount = mock((_args?: PrismaWhereArg): Promise<number> =>
  Promise.resolve(0),
);
const mockInquiryFindMany = mock((_args?: PrismaWhereArg): Promise<unknown[]> =>
  Promise.resolve([]),
);
const mockSpaceCount = mock((_args?: PrismaWhereArg): Promise<number> =>
  Promise.resolve(0),
);
const mockQueryRaw = mock((): Promise<unknown[]> => Promise.resolve([]));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      count: mockReservationCount,
      aggregate: mockReservationAggregate,
      findMany: mockReservationFindMany,
    },
    inquiry: {
      count: mockInquiryCount,
      findMany: mockInquiryFindMany,
    },
    space: {
      count: mockSpaceCount,
    },
    $queryRaw: (..._args: unknown[]) => mockQueryRaw(),
  },
}));

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    join: (vals: unknown[]) => vals,
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) =>
      strings.join(""),
    raw: (s: string) => s,
  },
}));

mock.module("@generated/prisma/enums", () => ({
  ReservationStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  },
  InquiryStatus: {
    NEW: "NEW",
    IN_PROGRESS: "IN_PROGRESS",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED",
    FLAGGED: "FLAGGED",
    SPAM: "SPAM",
  },
}));

const {
  getDashboardStats,
  getRecentReservations,
  getRecentInquiries,
  getTodayReservations,
  getReservationChartData,
} = await import("@/shared/domain/dashboard/queries");

const RealDate = Date;

/** UTC 2025-06-30T15:00:00Z = JST 2025-07-01 00:00:00 */
const FIXED_JST_MIDNIGHT_UTC = "2025-06-30T15:00:00.000Z";

function withFixedNow<T>(isoUtc: string, fn: () => Promise<T>): Promise<T> {
  const fixedMs = new RealDate(isoUtc).getTime();
  const MockDate = class extends RealDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? fixedMs : value);
    }
    static override now(): number {
      return fixedMs;
    }
  };
  globalThis.Date = MockDate as DateConstructor;
  return fn().finally(() => {
    globalThis.Date = RealDate;
  });
}

describe("getDashboardStats", () => {
  beforeEach(() => {
    mockReservationCount.mockReset();
    mockReservationAggregate.mockReset();
    mockInquiryCount.mockReset();
    mockSpaceCount.mockReset();
    mockReservationAggregate.mockResolvedValue({ _sum: { totalPrice: null } });
  });

  test("8 並列クエリの結果を集計して changePercent を計算する", async () => {
    // 順序: thisMonthRes / lastMonthRes / thisRev / lastRev / newInq / thisInq / activeSpace / totalSpace
    mockReservationCount
      .mockResolvedValueOnce(20) // thisMonthReservations
      .mockResolvedValueOnce(10); // lastMonthReservations
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: 50000 } }) // thisMonthRevenue
      .mockResolvedValueOnce({ _sum: { totalPrice: 25000 } }); // lastMonthRevenue
    mockInquiryCount
      .mockResolvedValueOnce(3) // newInquiries
      .mockResolvedValueOnce(8); // thisMonthInquiries
    mockSpaceCount
      .mockResolvedValueOnce(5) // activeSpaces
      .mockResolvedValueOnce(10); // totalSpaces

    const stats = await getDashboardStats();

    expect(stats.reservations).toEqual({
      thisMonth: 20,
      lastMonth: 10,
      changePercent: 100,
    });
    expect(stats.revenue).toEqual({
      thisMonth: 50000,
      lastMonth: 25000,
      changePercent: 100,
    });
    expect(stats.inquiries).toEqual({ new: 3, thisMonth: 8 });
    expect(stats.spaces).toEqual({ active: 5, total: 10 });
  });

  test("前月 0 + 当月 0 の changePercent は 0（ゼロ除算なし）", async () => {
    mockReservationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: null } })
      .mockResolvedValueOnce({ _sum: { totalPrice: null } });
    mockInquiryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockSpaceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const stats = await getDashboardStats();

    expect(stats.reservations.changePercent).toBe(0);
    expect(stats.revenue.changePercent).toBe(0);
  });

  test("前月 0 + 当月 > 0 の changePercent は 100", async () => {
    mockReservationCount.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: null } })
      .mockResolvedValueOnce({ _sum: { totalPrice: null } });
    mockInquiryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockSpaceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const stats = await getDashboardStats();

    expect(stats.reservations.changePercent).toBe(100);
  });

  test("予約 count/aggregate に deletedAt: null を含む", async () => {
    mockReservationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: null } })
      .mockResolvedValueOnce({ _sum: { totalPrice: null } });
    mockInquiryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockSpaceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await getDashboardStats();

    for (const call of mockReservationCount.mock.calls) {
      expect(call[0]).toMatchObject({
        where: expect.objectContaining({ deletedAt: null }),
      });
    }
    for (const call of mockReservationAggregate.mock.calls) {
      expect(call[0]).toMatchObject({
        where: expect.objectContaining({ deletedAt: null }),
      });
    }
  });

  test("inquiry thisMonth は SPAM を除外する", async () => {
    mockReservationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: null } })
      .mockResolvedValueOnce({ _sum: { totalPrice: null } });
    mockInquiryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockSpaceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await getDashboardStats();

    const thisMonthInquiryCall = mockInquiryCount.mock.calls[1]?.[0];
    expect(thisMonthInquiryCall).toMatchObject({
      where: expect.objectContaining({
        deletedAt: null,
        status: { not: "SPAM" },
      }),
    });
  });

  test("JST 月境界: UTC 15:00 (= JST 翌日 00:00) で今月=7月・先月=6月", async () => {
    mockReservationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockReservationAggregate
      .mockResolvedValueOnce({ _sum: { totalPrice: null } })
      .mockResolvedValueOnce({ _sum: { totalPrice: null } });
    mockInquiryCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockSpaceCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await withFixedNow(FIXED_JST_MIDNIGHT_UTC, () => getDashboardStats());

    const expectedThisMonthStart = new RealDate("2025-07-01T00:00:00+09:00");
    const expectedLastMonthStart = new RealDate("2025-06-01T00:00:00+09:00");

    const thisMonthResCall = mockReservationCount.mock.calls[0]?.[0] as
      PrismaWhereArg | undefined;
    expect(thisMonthResCall?.where?.createdAt?.gte).toEqual(
      expectedThisMonthStart,
    );

    const lastMonthResCall = mockReservationCount.mock.calls[1]?.[0] as
      PrismaWhereArg | undefined;
    expect(lastMonthResCall?.where?.createdAt).toEqual({
      gte: expectedLastMonthStart,
      lt: expectedThisMonthStart,
    });

    const thisMonthInquiryCall = mockInquiryCount.mock.calls[1]?.[0] as
      PrismaWhereArg | undefined;
    expect(thisMonthInquiryCall?.where?.createdAt?.gte).toEqual(
      expectedThisMonthStart,
    );
  });
});

describe("getRecentReservations", () => {
  beforeEach(() => {
    mockReservationFindMany.mockReset();
  });

  test("limit < 1 はデフォルト 5 に正規化", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await getRecentReservations(0);

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  test("limit > 50 は MAX_LIST_LIMIT 50 にクランプ", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await getRecentReservations(200);

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  test("deletedAt: null と cancelled/no-show 除外 where を渡す", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await getRecentReservations(5);

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
      }),
    );
  });

  test("relation 結果を RecentReservation に map（lastName + firstName）", async () => {
    mockReservationFindMany.mockResolvedValueOnce([
      {
        id: "r1",
        startTime: new Date("2025-06-01T10:00:00Z"),
        endTime: new Date("2025-06-01T12:00:00Z"),
        status: "CONFIRMED",
        totalPrice: 5000,
        space: { name: "Studio A" },
        customer: { lastName: "山田", firstName: "太郎" },
      },
    ]);

    const result = await getRecentReservations(5);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "r1",
      spaceName: "Studio A",
      customerName: "山田 太郎",
      status: "CONFIRMED",
      totalPrice: 5000,
    });
  });
});

describe("getTodayReservations", () => {
  beforeEach(() => {
    mockReservationFindMany.mockReset();
  });

  test("deletedAt: null と cancelled/no-show 除外 where を渡す", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    await getTodayReservations();

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        }),
      }),
    );
  });

  test("JST 今日窓: gte todayStart, lt tomorrowStart", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);

    await withFixedNow(FIXED_JST_MIDNIGHT_UTC, () => getTodayReservations());

    const call = mockReservationFindMany.mock.calls[0]?.[0] as
      PrismaWhereArg | undefined;
    const startTime = call?.where?.startTime;
    expect(startTime?.gte).toEqual(new RealDate("2025-07-01T00:00:00+09:00"));
    expect(startTime?.lt).toEqual(new RealDate("2025-07-02T00:00:00+09:00"));
    expect(startTime?.lte).toBeUndefined();
  });
});

describe("getRecentInquiries", () => {
  beforeEach(() => {
    mockInquiryFindMany.mockReset();
  });

  test("Inquiry 行を RecentInquiry として返す", async () => {
    mockInquiryFindMany.mockResolvedValueOnce([
      {
        id: "i1",
        receiptNumber: "INQ-ABCD1234",
        name: "佐藤花子",
        email: "hanako@example.com",
        subject: "予約の確認",
        status: "NEW",
        createdAt: new Date("2025-06-01T00:00:00Z"),
      },
    ]);

    const result = await getRecentInquiries();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "i1",
      receiptNumber: "INQ-ABCD1234",
      name: "佐藤花子",
      email: "hanako@example.com",
      subject: "予約の確認",
      status: "NEW",
    });
    expect(result[0]).not.toHaveProperty("hasReplies");
  });

  test("soft-deleted を除外する where を渡す", async () => {
    mockInquiryFindMany.mockResolvedValueOnce([]);
    await getRecentInquiries();

    expect(mockInquiryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
      }),
    );
  });
});

describe("getReservationChartData", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  test("DB 結果が空でも 30 日分の点を 0 で埋めて返す", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await getReservationChartData();

    expect(result.windowDays).toBe(30);
    expect(result.data).toHaveLength(30);
    expect(result.summary.totalReservations).toBe(0);
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.summary.peakReservations).toBe(0);
  });

  test("DB 結果から peak / total を集計する", async () => {
    // 既知の JST 日付（今日基準）で 1 日分だけ stat を返す
    const todayJst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    mockQueryRaw.mockResolvedValueOnce([
      { date: todayJst, reservations: 7n, revenue: 100000 },
    ]);

    const result = await getReservationChartData();

    expect(result.summary.totalReservations).toBe(7);
    expect(result.summary.totalRevenue).toBe(100000);
    expect(result.summary.peakReservations).toBe(7);
    expect(result.summary.peakRevenue).toBe(100000);
    expect(result.summary.averageReservationsPerDay).toBeCloseTo(7 / 30);
  });
});
