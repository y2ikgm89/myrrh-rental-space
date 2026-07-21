/**
 * getWaitlistQueue のページネーション挙動をロックする。
 *
 * Round-4 audit Finding #20 / medium: 旧実装は take/skip なしの無条件 findMany
 * だった。人気イベントで waitlist が数百件溜まると全件を一度に fetch する
 * unbounded query になっていた。events/[id]/page.tsx の参加者一覧
 * (getEventRegistrations) と同じ pagination (count + skip/take) に揃える。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const RegistrationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  WAITLISTED: "WAITLISTED",
  WAITLISTED_OFFERED: "WAITLISTED_OFFERED",
  EXPIRED: "EXPIRED",
} as const;

mock.module("server-only", () => ({}));
mock.module("@generated/prisma/enums", () => ({
  PaymentStatus: { UNPAID: "UNPAID", PAID: "PAID" },
  RegistrationStatus,
}));
mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  PaymentStatus: { UNPAID: "UNPAID", PAID: "PAID" },
  RegistrationStatus,
}));
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  WAITLIST_ACTIVE_STATUSES: [
    RegistrationStatus.WAITLISTED,
    RegistrationStatus.WAITLISTED_OFFERED,
  ],
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://app.example.test",
}));
mock.module("@/shared/lib/tokens/waitlist-offer-token", () => ({
  createWaitlistOfferToken: () => "token",
}));
mock.module("@/shared/lib/pagination", () => ({
  calcTotalPages: (total: number, limit: number) => Math.ceil(total / limit),
  paginate: (opts: { page?: number; limit?: number }) => {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    return { skip: (page - 1) * limit, take: limit, page, limit };
  },
}));

const mockCount = mock<(args: Record<string, unknown>) => Promise<number>>(() =>
  Promise.resolve(0),
);
const mockFindMany = mock<
  (args: Record<string, unknown>) => Promise<unknown[]>
>(() => Promise.resolve([]));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      count: (args: Record<string, unknown>) => mockCount(args),
      findMany: (args: Record<string, unknown>) => mockFindMany(args),
    },
  },
}));

const { getWaitlistQueue, WAITLIST_QUEUE_PER_PAGE } =
  await import("@/shared/domain/events/waitlist-queries");

describe("getWaitlistQueue pagination", () => {
  beforeEach(() => {
    mockCount.mockReset();
    mockFindMany.mockReset();
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
  });

  test("findMany に skip/take が渡される（デフォルト perPage）", async () => {
    mockCount.mockResolvedValue(45);
    await getWaitlistQueue("event-1");

    const call = mockFindMany.mock.calls[0]?.[0] as
      { skip?: number; take?: number } | undefined;
    expect(call).toBeDefined();
    expect(call!.skip).toBe(0);
    expect(call!.take).toBe(WAITLIST_QUEUE_PER_PAGE);
  });

  test("page=3 指定で skip が (page-1)*perPage になる", async () => {
    mockCount.mockResolvedValue(100);
    await getWaitlistQueue("event-1", { page: 3, perPage: 20 });

    const call = mockFindMany.mock.calls[0]?.[0] as
      { skip?: number; take?: number } | undefined;
    expect(call!.skip).toBe(40);
    expect(call!.take).toBe(20);
  });

  test("戻り値に total/page/perPage/totalPages が含まれる", async () => {
    mockCount.mockResolvedValue(45);
    const result = await getWaitlistQueue("event-1", { page: 1, perPage: 20 });

    expect(result.total).toBe(45);
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.totalPages).toBe(3);
  });

  test("count の where に eventId + WAITLIST_ACTIVE_STATUSES が渡される", async () => {
    await getWaitlistQueue("event-42");

    const countArgs = mockCount.mock.calls[0]?.[0] as
      { where?: { eventId?: string; status?: { in?: string[] } } } | undefined;
    expect(countArgs?.where?.eventId).toBe("event-42");
    expect(countArgs?.where?.status?.in).toEqual([
      RegistrationStatus.WAITLISTED,
      RegistrationStatus.WAITLISTED_OFFERED,
    ]);
  });
});
