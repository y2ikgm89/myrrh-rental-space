/**
 * reservationSettingsSchema の相互制約（min/max、予約時間単位の倍数）を検証する。
 */
import { describe, test, expect } from "bun:test";
import { reservationSettingsSchema } from "@/admin/actions/settings/schemas/basic";

const VALID_OBJECT = {
  defaultTimeSlot: 30,
  minReservationDuration: 60,
  maxReservationDuration: 480,
  cancellationDeadlineHours: 24,
  modificationDeadlineHours: 24,
  customerCanCancelSeriesInFull: false,
  maxRecurrenceInstances: 26,
  expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("reservationSettingsSchema mutual constraints", () => {
  test("有効な組み合わせは success", () => {
    const result = reservationSettingsSchema.safeParse(VALID_OBJECT);
    expect(result.success).toBe(true);
  });

  test("minReservationDuration > maxReservationDuration は error", () => {
    const result = reservationSettingsSchema.safeParse({
      ...VALID_OBJECT,
      minReservationDuration: 480,
      maxReservationDuration: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("minReservationDuration"),
        ),
      ).toBe(true);
    }
  });

  test("defaultTimeSlot が 15 分刻みでない場合は error", () => {
    const result = reservationSettingsSchema.safeParse({
      ...VALID_OBJECT,
      defaultTimeSlot: 20,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("defaultTimeSlot"),
        ),
      ).toBe(true);
    }
  });

  test("minReservationDuration が予約時間単位の倍数でない場合は error", () => {
    const result = reservationSettingsSchema.safeParse({
      ...VALID_OBJECT,
      minReservationDuration: 45,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("minReservationDuration"),
        ),
      ).toBe(true);
    }
  });

  test("maxReservationDuration が予約時間単位の倍数でない場合は error", () => {
    const result = reservationSettingsSchema.safeParse({
      ...VALID_OBJECT,
      maxReservationDuration: 490,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("maxReservationDuration"),
        ),
      ).toBe(true);
    }
  });
});
