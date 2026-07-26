/**
 * calendar .ics DL の per-resource 第二防壁。
 *
 * - `calendarDownloadByReservationIdRateLimiter` — 10 / hour / reservationId
 * - `calendarDownloadByRegistrationIdRateLimiter` — 10 / hour / registrationId
 *
 * `receiptDownloadBySerialNoRateLimiter` と同型の契約を verify する。
 */

import { describe, expect, test } from "bun:test";
import {
  calendarDownloadByRegistrationIdRateLimiter,
  calendarDownloadByReservationIdRateLimiter,
} from "@/shared/lib/rate-limit";

describe("calendarDownloadByReservationIdRateLimiter", () => {
  test("同一 reservationId の 10 回目までは success", async () => {
    const reservationId = "cal-res-ok-under-limit";
    for (let i = 0; i < 10; i += 1) {
      const result =
        await calendarDownloadByReservationIdRateLimiter.check(reservationId);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10 - (i + 1));
    }
  });

  test("同一 reservationId の 11 回目は blocked", async () => {
    const reservationId = "cal-res-blocked-at-eleventh";
    for (let i = 0; i < 10; i += 1) {
      const result =
        await calendarDownloadByReservationIdRateLimiter.check(reservationId);
      expect(result.success).toBe(true);
    }

    const blocked =
      await calendarDownloadByReservationIdRateLimiter.check(reservationId);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  test("異なる reservationId は独立してカウントされる", async () => {
    const a = "cal-res-independent-bucket-a";
    const b = "cal-res-independent-bucket-b";

    for (let i = 0; i < 10; i += 1) {
      const r = await calendarDownloadByReservationIdRateLimiter.check(a);
      expect(r.success).toBe(true);
    }
    const aBlocked = await calendarDownloadByReservationIdRateLimiter.check(a);
    expect(aBlocked.success).toBe(false);

    const bFirst = await calendarDownloadByReservationIdRateLimiter.check(b);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(9);
  });

  test("reset(reservationId) で bucket がクリアされる", async () => {
    const reservationId = "cal-res-reset-recovers";
    for (let i = 0; i < 10; i += 1) {
      await calendarDownloadByReservationIdRateLimiter.check(reservationId);
    }
    const blocked =
      await calendarDownloadByReservationIdRateLimiter.check(reservationId);
    expect(blocked.success).toBe(false);

    await calendarDownloadByReservationIdRateLimiter.reset(reservationId);

    const afterReset =
      await calendarDownloadByReservationIdRateLimiter.check(reservationId);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(9);
  });

  test("reset 時刻は 1 時間先 (interval = 60 * 60 * 1000)", async () => {
    const reservationId = "cal-res-reset-time-window";
    const before = Date.now();
    const result =
      await calendarDownloadByReservationIdRateLimiter.check(reservationId);
    expect(result.reset).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 100);
    expect(result.reset).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 100);
  });
});

describe("calendarDownloadByRegistrationIdRateLimiter", () => {
  test("同一 registrationId の 10 回目までは success", async () => {
    const registrationId = "cal-reg-ok-under-limit";
    for (let i = 0; i < 10; i += 1) {
      const result =
        await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10 - (i + 1));
    }
  });

  test("同一 registrationId の 11 回目は blocked", async () => {
    const registrationId = "cal-reg-blocked-at-eleventh";
    for (let i = 0; i < 10; i += 1) {
      const result =
        await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
      expect(result.success).toBe(true);
    }

    const blocked =
      await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  test("異なる registrationId は独立してカウントされる", async () => {
    const a = "cal-reg-independent-bucket-a";
    const b = "cal-reg-independent-bucket-b";

    for (let i = 0; i < 10; i += 1) {
      const r = await calendarDownloadByRegistrationIdRateLimiter.check(a);
      expect(r.success).toBe(true);
    }
    const aBlocked = await calendarDownloadByRegistrationIdRateLimiter.check(a);
    expect(aBlocked.success).toBe(false);

    const bFirst = await calendarDownloadByRegistrationIdRateLimiter.check(b);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(9);
  });

  test("reset(registrationId) で bucket がクリアされる", async () => {
    const registrationId = "cal-reg-reset-recovers";
    for (let i = 0; i < 10; i += 1) {
      await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
    }
    const blocked =
      await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
    expect(blocked.success).toBe(false);

    await calendarDownloadByRegistrationIdRateLimiter.reset(registrationId);

    const afterReset =
      await calendarDownloadByRegistrationIdRateLimiter.check(registrationId);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(9);
  });
});
