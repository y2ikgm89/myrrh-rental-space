import { describe, test, expect } from "bun:test";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";

describe("isWithinDeadline", () => {
  test("予約開始の24時間以上前なら true", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-30T10:00:00Z"); // 48時間前
    expect(isWithinDeadline(startTime, 24, now)).toBe(true);
  });

  test("予約開始の24時間以内なら false", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-31T20:00:00Z"); // 14時間前
    expect(isWithinDeadline(startTime, 24, now)).toBe(false);
  });

  test("ちょうど24時間前なら true（境界値）", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-31T10:00:00Z");
    expect(isWithinDeadline(startTime, 24, now)).toBe(true);
  });

  test("deadlineHours=1 で1時間以内なら false", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-04-01T09:30:00Z"); // 30分前
    expect(isWithinDeadline(startTime, 1, now)).toBe(false);
  });
});
