/**
 * buildReservationListWhere は一覧クエリ (getReservationsQuery) と CSV export
 * (getReservationsForExport) が共有する where 句ビルダー。Round-4 audit
 * Finding #13 の修正 (export が一覧の filter を無視していた) がこの共有関数に
 * 依存しているため、where 句の形を直接ロックする。
 */

import { describe, test, expect, mock } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

mock.module("server-only", () => ({}));
await installPrismaEnumsMock();
mock.module("@/shared/db/prisma", () => ({
  prisma: { reservation: { count: () => 0, findMany: () => [] } },
}));
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  ACTIVE_RESERVATION_STATUSES: [
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
  ],
}));
mock.module("@/shared/lib/pagination", () => ({
  calcTotalPages: (total: number, limit: number) => Math.ceil(total / limit),
  paginate: (opts: { page?: number; limit?: number }) => {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    return { skip: (page - 1) * limit, take: limit, page, limit };
  },
}));
mock.module("@/shared/lib/serialize", () => ({
  toPlainArray: <T>(v: T) => v,
  toPlainObject: <T>(v: T) => v,
}));

const { buildReservationListWhere } =
  await import("@/shared/domain/reservations/admin-queries");

describe("buildReservationListWhere", () => {
  test("tab=all + no filters → deletedAt: null のみ", () => {
    const where = buildReservationListWhere({});
    expect(where).toEqual({ deletedAt: null });
  });

  test("tab=pending → status: PENDING を含む", () => {
    const where = buildReservationListWhere({ tab: "pending" });
    expect(where).toMatchObject({
      deletedAt: null,
      status: ReservationStatus.PENDING,
    });
  });

  test("tab=confirmed → status: CONFIRMED を含む", () => {
    const where = buildReservationListWhere({ tab: "confirmed" });
    expect(where).toMatchObject({
      deletedAt: null,
      status: ReservationStatus.CONFIRMED,
    });
  });

  test("tab=cancelled → status in [CANCELLED, NO_SHOW]", () => {
    const where = buildReservationListWhere({ tab: "cancelled" });
    expect(where).toMatchObject({
      deletedAt: null,
      status: { in: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] },
    });
  });

  test("userId 指定 → where.userId に反映される (Round-4 Finding #14)", () => {
    const where = buildReservationListWhere({ userId: "staff-1" });
    expect(where).toMatchObject({ userId: "staff-1" });
  });

  test("spaceId 指定 → where.spaceId に反映される", () => {
    const where = buildReservationListWhere({ spaceId: "space-1" });
    expect(where).toMatchObject({ spaceId: "space-1" });
  });

  test("search 指定 → customer/space の OR 条件が構築される", () => {
    const where = buildReservationListWhere({ search: "山田" });
    expect(where.OR).toBeDefined();
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(2);
  });

  test("startDate/endDate 指定 → JST 日境界の gte/lt が構築される", () => {
    const where = buildReservationListWhere({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(where.startTime).toEqual({
      gte: new Date("2026-01-01T00:00:00+09:00"),
      lt: new Date("2026-02-01T00:00:00+09:00"),
    });
  });

  test("全 filter 同時指定 → 全て反映される", () => {
    const where = buildReservationListWhere({
      tab: "confirmed",
      search: "田中",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      spaceId: "space-1",
      userId: "staff-1",
    });
    expect(where).toMatchObject({
      deletedAt: null,
      status: ReservationStatus.CONFIRMED,
      spaceId: "space-1",
      userId: "staff-1",
      startTime: {
        gte: new Date("2026-01-01T00:00:00+09:00"),
        lt: new Date("2026-02-01T00:00:00+09:00"),
      },
    });
    expect(where.OR).toBeDefined();
  });
});
