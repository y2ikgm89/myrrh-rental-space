import { describe, test, expect } from "bun:test";
import { getReservationCardDeadlineState } from "@/shared/domain/reservations/reservation-card-deadline";

const SETTINGS = {
  modificationDeadlineHours: 24,
  cancellationDeadlineHours: 24,
} as const;

describe("getReservationCardDeadlineState", () => {
  test("PENDING かつ変更・キャンセル期限内なら両方 true", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-30T10:00:00Z");
    const result = getReservationCardDeadlineState(
      { status: "PENDING", startTime },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(true);
    expect(result.canCancel).toBe(true);
    expect(result.showPastDeadlineMessage).toBe(false);
  });

  test("期限外なら変更・キャンセル不可・メッセージ表示", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-04-01T09:00:00Z");
    const result = getReservationCardDeadlineState(
      { status: "CONFIRMED", startTime },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(false);
    expect(result.showPastDeadlineMessage).toBe(true);
  });

  test("COMPLETED ならすべて false", () => {
    const startTime = new Date("2026-04-10T10:00:00Z");
    const now = new Date("2026-03-01T10:00:00Z");
    const result = getReservationCardDeadlineState(
      { status: "COMPLETED", startTime },
      SETTINGS,
      now,
    );
    expect(result.canModify).toBe(false);
    expect(result.canCancel).toBe(false);
    expect(result.showPastDeadlineMessage).toBe(false);
  });
});
