import { describe, expect, test } from "bun:test";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  resolveRateBreakdown,
  type SpaceRatePlanForResolver,
} from "@/shared/lib/pricing/rate-plan-resolver";

// JST Date helper: "YYYY-MM-DDTHH:mm" → Date (JST wall clock を UTC 相当に)
const jst = (iso: string) => new Date(`${iso}:00+09:00`);

// Rate plan factory
const plan = (
  partial: Partial<SpaceRatePlanForResolver>,
): SpaceRatePlanForResolver => ({
  id: "p1",
  name: "test",
  hourlyPrice: 3000,
  daysOfWeek: [],
  holidayMode: HolidayMode.any,
  startTime: null,
  endTime: null,
  effectiveFrom: null,
  effectiveTo: null,
  updatedAt: new Date("2026-01-01"),
  ...partial,
});

const noHoliday = () => false;

describe("resolveRateBreakdown", () => {
  test("rate plan 空 → Space.hourlyPrice フォールバック", () => {
    const result = resolveRateBreakdown({
      ratePlans: [],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[0].ratePlanId).toBe(null);
    expect(result.segments[0].ratePlanName).toBe("基本料金");
    expect(result.totalBasePrice).toBe(4000);
    expect(result.totalHours).toBe(2);
  });

  test("曜日別: 金曜のみ適用", () => {
    const fridayPlan = plan({
      id: "f",
      name: "金曜料金",
      hourlyPrice: 4000,
      daysOfWeek: [DayOfWeek.FRIDAY],
    });
    const result = resolveRateBreakdown({
      ratePlans: [fridayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T10:00"), // 2026-07-17 は金曜
      endDateTime: jst("2026-07-17T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].hourlyPrice).toBe(4000);
    expect(result.segments[0].ratePlanId).toBe("f");
  });

  test("時間帯別: 18:00-22:00 のみ適用", () => {
    const eveningPlan = plan({
      id: "e",
      name: "夜料金",
      hourlyPrice: 5000,
      startTime: "18:00",
      endTime: "22:00",
    });
    const result = resolveRateBreakdown({
      ratePlans: [eveningPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T16:00"),
      endDateTime: jst("2026-07-15T20:00"),
      holidayJudge: noHoliday,
    });
    // 16-18: 基本料金, 18-20: 夜料金
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[1].hourlyPrice).toBe(5000);
    expect(result.totalBasePrice).toBe(2000 * 2 + 5000 * 2);
  });

  test("深夜跨ぎ: 金 22:00 - 土 02:00 → 2 segment 分割", () => {
    const weekendPlan = plan({
      id: "w",
      name: "土曜料金",
      hourlyPrice: 4000,
      daysOfWeek: [DayOfWeek.SATURDAY],
    });
    const result = resolveRateBreakdown({
      ratePlans: [weekendPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T22:00"), // 金 22:00
      endDateTime: jst("2026-07-18T02:00"), // 土 02:00
      holidayJudge: noHoliday,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].hourlyPrice).toBe(2000); // 金 22-24
    expect(result.segments[1].hourlyPrice).toBe(4000); // 土 00-02
  });

  test("特定期間: effectiveFrom / effectiveTo 外は非適用", () => {
    const gwPlan = plan({
      id: "gw",
      name: "GW",
      hourlyPrice: 6000,
      effectiveFrom: new Date("2026-05-01"),
      effectiveTo: new Date("2026-05-06"),
    });
    const result = resolveRateBreakdown({
      ratePlans: [gwPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].ratePlanId).toBe(null); // 期間外
  });

  test("祝日 only: 祝日のみ適用", () => {
    const holidayPlan = plan({
      id: "h",
      name: "祝日料金",
      hourlyPrice: 5000,
      holidayMode: HolidayMode.only,
    });
    // 2026-05-05 (火) は祝日
    const result = resolveRateBreakdown({
      ratePlans: [holidayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-05-05T10:00"),
      endDateTime: jst("2026-05-05T12:00"),
      holidayJudge: (d) => d === "2026-05-05",
    });
    expect(result.segments[0].hourlyPrice).toBe(5000);
    expect(result.holidayFlags["2026-05-05"]).toBe(true);
  });

  test("祝日 exclude: 祝日は非適用", () => {
    const weekdayPlan = plan({
      id: "wd",
      name: "平日料金",
      hourlyPrice: 3000,
      holidayMode: HolidayMode.exclude,
    });
    const result = resolveRateBreakdown({
      ratePlans: [weekdayPlan],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-05-05T10:00"), // 祝日
      endDateTime: jst("2026-05-05T12:00"),
      holidayJudge: (d) => d === "2026-05-05",
    });
    expect(result.segments[0].ratePlanId).toBe(null); // 祝日除外で fallback
  });

  test("優先度: 2 plan が同時マッチ → updatedAt 新しい方採用", () => {
    const oldPlan = plan({
      id: "old",
      name: "旧金曜料金",
      hourlyPrice: 3000,
      daysOfWeek: [DayOfWeek.FRIDAY],
      updatedAt: new Date("2026-01-01"),
    });
    const newPlan = plan({
      id: "new",
      name: "新金曜料金",
      hourlyPrice: 5000,
      daysOfWeek: [DayOfWeek.FRIDAY],
      updatedAt: new Date("2026-06-01"),
    });
    const result = resolveRateBreakdown({
      ratePlans: [oldPlan, newPlan], // 順序に依存しない (関数内でソート)
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T10:00"), // 金
      endDateTime: jst("2026-07-17T12:00"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].ratePlanId).toBe("new");
    expect(result.segments[0].hourlyPrice).toBe(5000);
  });

  test("複合条件 (金曜 AND 18-22時) + segment 分割", () => {
    const combo = plan({
      id: "c",
      name: "金夜料金",
      hourlyPrice: 6000,
      daysOfWeek: [DayOfWeek.FRIDAY],
      startTime: "18:00",
      endTime: "22:00",
    });
    const result = resolveRateBreakdown({
      ratePlans: [combo],
      spaceHourlyPrice: 2000,
      startDateTime: jst("2026-07-17T16:00"), // 金 16:00
      endDateTime: jst("2026-07-18T00:00"), // 土 00:00
      holidayJudge: noHoliday,
    });
    // 金16-18: 基本, 金18-22: 金夜, 金22-24: 基本 (土は 00:00 で境界 exclusive)
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].hourlyPrice).toBe(2000);
    expect(result.segments[1].hourlyPrice).toBe(6000);
    expect(result.segments[2].hourlyPrice).toBe(2000);
    expect(result.totalHours).toBe(8);
  });

  test("Math.floor 丸め: hourlyPrice 3333 × 1.5h = 4999", () => {
    const result = resolveRateBreakdown({
      ratePlans: [],
      spaceHourlyPrice: 3333,
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T11:30"),
      holidayJudge: noHoliday,
    });
    expect(result.segments[0].subtotal).toBe(4999); // Math.floor(3333 * 1.5)
    expect(result.totalBasePrice).toBe(4999);
  });
});
