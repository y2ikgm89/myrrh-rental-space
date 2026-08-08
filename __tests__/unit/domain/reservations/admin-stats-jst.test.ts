/**
 * getReservationStatsQuery の JST 窓計算の unit test。
 *
 * Cloud Run は UTC で動く。process TZ 依存の `new Date().setHours(0, 0, 0, 0)` を
 * 使うと、JST 00:00-09:00 の予約が "今日" bucket から漏れて "昨日" にカウントされる
 * silent bug になる (JST=UTC+9)。
 *
 * 本 test は「実行時 TZ に関わらず、todayCount / thisWeekCount の Prisma count
 * where 引数が JST 深夜に対応する UTC instant を持つ」ことを検証する。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { definite } from "../../../support/definite";

const mockReservationCount = mock<(...args: unknown[]) => Promise<number>>(() =>
  Promise.resolve(0),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { count: mockReservationCount },
  },
}));

const { getReservationStatsQuery } =
  await import("@/shared/domain/reservations/admin-queries");

type CountArgs = {
  where: {
    startTime?: {
      gte?: Date;
      lt?: Date;
    };
  };
};

function extractCountCall(index: number): CountArgs {
  const call = mockReservationCount.mock.calls[index];
  if (!call || call.length === 0) {
    throw new Error(`mockReservationCount call ${index} not found`);
  }
  const [arg] = call;
  if (!arg || typeof arg !== "object") {
    throw new Error(`mockReservationCount call ${index} first arg not object`);
  }
  return arg as CountArgs;
}

describe("getReservationStatsQuery — JST 窓計算", () => {
  beforeEach(() => {
    mockReservationCount.mockClear();
    mockReservationCount.mockResolvedValue(0);
  });

  test("todayCount の startTime.gte は JST 00:00 (= UTC 前日 15:00)", async () => {
    await getReservationStatsQuery();

    // Promise.all の順序: [total, pending, confirmed, completed, cancelled,
    // noShow, todayCount, thisWeekCount] → todayCount は index 6
    expect(mockReservationCount.mock.calls.length).toBe(8);
    const args = extractCountCall(6);
    const gte = definite(args.where.startTime?.gte, "where.startTime.gte");
    const lt = definite(args.where.startTime?.lt, "where.startTime.lt");
    expect(gte).toBeInstanceOf(Date);
    expect(lt).toBeInstanceOf(Date);

    // JST 00:00 = UTC 前日 15:00 (JST=UTC+9)。process TZ が何であれ成立する。
    expect(gte.getUTCHours()).toBe(15);
    expect(gte.getUTCMinutes()).toBe(0);
    expect(gte.getUTCSeconds()).toBe(0);
    expect(gte.getUTCMilliseconds()).toBe(0);

    // lt は gte + 24h
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test("thisWeekCount の startTime.gte は JST の日曜 00:00 (= UTC 土曜 15:00)", async () => {
    await getReservationStatsQuery();

    // thisWeekCount は index 7
    const args = extractCountCall(7);
    const weekStart = definite(
      args.where.startTime?.gte,
      "週の where.startTime.gte",
    );
    expect(weekStart).toBeInstanceOf(Date);

    // JST の日曜 00:00 = UTC の土曜 15:00
    expect(weekStart.getUTCHours()).toBe(15);
    expect(weekStart.getUTCDay()).toBe(6); // Saturday in UTC = Sunday in JST
    expect(weekStart.getUTCMinutes()).toBe(0);
    expect(weekStart.getUTCSeconds()).toBe(0);
  });

  test("weekStart は todayStart 以下 (今日が日曜なら等しい)", async () => {
    await getReservationStatsQuery();

    const today = extractCountCall(6);
    const week = extractCountCall(7);
    const todayStart = definite(
      today.where.startTime?.gte,
      "当日の where.startTime.gte",
    );
    const weekStart = definite(
      week.where.startTime?.gte,
      "週の where.startTime.gte",
    );
    expect(todayStart).toBeInstanceOf(Date);
    expect(weekStart).toBeInstanceOf(Date);

    expect(weekStart.getTime()).toBeLessThanOrEqual(todayStart.getTime());
    // 週の期間内 (0-6 日前)
    const daysBefore =
      (todayStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysBefore).toBeGreaterThanOrEqual(0);
    expect(daysBefore).toBeLessThan(7);
  });
});
