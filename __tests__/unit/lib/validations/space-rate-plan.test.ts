/**
 * SpaceRatePlan フォームバリデーションテスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space-rate-plan.ts
 */

import { describe, test, expect } from "bun:test";
import { spaceRatePlanFormSchema } from "@/admin/lib/validations/space-rate-plan";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";

const BASE_INPUT = {
  spaceId: SPACE_ID,
  name: "平日昼間",
  hourlyPrice: 1500,
  daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
  holidayMode: HolidayMode.EXCLUDE,
  startTime: "10:00",
  endTime: "18:00",
  effectiveFrom: "2026-04-01",
  effectiveTo: "2026-09-30",
};

describe("spaceRatePlanFormSchema", () => {
  describe("empty → null", () => {
    test("空文字の時刻・日付は null に正規化する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        ...BASE_INPUT,
        startTime: "",
        endTime: "",
        effectiveFrom: "",
        effectiveTo: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeNull();
        expect(result.data.endTime).toBeNull();
        expect(result.data.effectiveFrom).toBeNull();
        expect(result.data.effectiveTo).toBeNull();
      }
    });

    test("undefined の時刻・日付は null に正規化する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        spaceId: SPACE_ID,
        name: "終日プラン",
        hourlyPrice: 2000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeNull();
        expect(result.data.endTime).toBeNull();
        expect(result.data.effectiveFrom).toBeNull();
        expect(result.data.effectiveTo).toBeNull();
        expect(result.data.daysOfWeek).toEqual([]);
        expect(result.data.holidayMode).toBe(HolidayMode.ANY);
      }
    });
  });

  describe("all-day create", () => {
    test("startTime/endTime 省略（終日）で作成できる", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        spaceId: SPACE_ID,
        name: "終日",
        hourlyPrice: 3000,
        daysOfWeek: [],
        holidayMode: HolidayMode.ANY,
        startTime: "",
        endTime: "",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeNull();
        expect(result.data.endTime).toBeNull();
        expect(result.data.effectiveFrom).toEqual(
          new Date("2026-01-01T00:00:00.000Z"),
        );
        expect(result.data.effectiveTo).toEqual(
          new Date("2026-12-31T00:00:00.000Z"),
        );
      }
    });
  });

  describe("open-ended dates", () => {
    test("effectiveFrom/effectiveTo 空欄（無期限）を許可する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        spaceId: SPACE_ID,
        name: "無期限プラン",
        hourlyPrice: 1000,
        startTime: "09:00",
        endTime: "17:00",
        effectiveFrom: "",
        effectiveTo: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.effectiveFrom).toBeNull();
        expect(result.data.effectiveTo).toBeNull();
        expect(result.data.startTime).toBe("09:00");
        expect(result.data.endTime).toBe("17:00");
      }
    });
  });

  describe("endTime sentinel", () => {
    test("24:00 を半開終端として許可する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        ...BASE_INPUT,
        startTime: "22:00",
        endTime: "24:00",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.endTime).toBe("24:00");
      }
    });

    test("24:30 は拒否する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        ...BASE_INPUT,
        startTime: "22:00",
        endTime: "24:30",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === "endTime"),
        ).toBe(true);
      }
    });

    test("24:59 は拒否する", () => {
      const result = spaceRatePlanFormSchema.safeParse({
        ...BASE_INPUT,
        endTime: "24:59",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === "endTime"),
        ).toBe(true);
      }
    });
  });

  describe("正常系", () => {
    test("有効なデータは検証を通過し日付を Date に変換する", () => {
      const result = spaceRatePlanFormSchema.safeParse(BASE_INPUT);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("平日昼間");
        expect(result.data.hourlyPrice).toBe(1500);
        expect(result.data.startTime).toBe("10:00");
        expect(result.data.endTime).toBe("18:00");
        expect(result.data.effectiveFrom).toEqual(
          new Date("2026-04-01T00:00:00.000Z"),
        );
        expect(result.data.effectiveTo).toEqual(
          new Date("2026-09-30T00:00:00.000Z"),
        );
      }
    });
  });
});
