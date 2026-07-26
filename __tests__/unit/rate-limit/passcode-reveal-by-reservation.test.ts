/**
 * `passcodeRevealByReservationRateLimiter` — パスコード開示の per-reservation 第二防壁。
 *
 * IP / per-user だけだと同一 reservation への decrypt 連打が抜ける。
 * `cancelByReservationRateLimiter` と同型で 3 attempts/hour/reservationId を敷く。
 */

import { describe, expect, test } from "bun:test";
import { passcodeRevealByReservationRateLimiter } from "@/shared/lib/rate-limit";

describe("passcodeRevealByReservationRateLimiter", () => {
  test("同一 reservationId の 3 回目までは success", async () => {
    const reservationId = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
    for (let i = 0; i < 3; i += 1) {
      const result =
        await passcodeRevealByReservationRateLimiter.check(reservationId);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(3 - (i + 1));
    }
  });

  test("同一 reservationId の 4 回目は blocked", async () => {
    const reservationId = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
    for (let i = 0; i < 3; i += 1) {
      const result =
        await passcodeRevealByReservationRateLimiter.check(reservationId);
      expect(result.success).toBe(true);
    }

    const blocked =
      await passcodeRevealByReservationRateLimiter.check(reservationId);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  test("異なる reservationId は独立してカウントされる", async () => {
    const a = "aaaaaaaa-bbbb-4ccc-8ddd-000000000003";
    const b = "aaaaaaaa-bbbb-4ccc-8ddd-000000000004";

    for (let i = 0; i < 3; i += 1) {
      const r = await passcodeRevealByReservationRateLimiter.check(a);
      expect(r.success).toBe(true);
    }
    const aBlocked = await passcodeRevealByReservationRateLimiter.check(a);
    expect(aBlocked.success).toBe(false);

    const bFirst = await passcodeRevealByReservationRateLimiter.check(b);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(2);
  });

  test("reset(reservationId) で bucket がクリアされる", async () => {
    const reservationId = "aaaaaaaa-bbbb-4ccc-8ddd-000000000005";
    for (let i = 0; i < 3; i += 1) {
      await passcodeRevealByReservationRateLimiter.check(reservationId);
    }
    const blocked =
      await passcodeRevealByReservationRateLimiter.check(reservationId);
    expect(blocked.success).toBe(false);

    await passcodeRevealByReservationRateLimiter.reset(reservationId);

    const afterReset =
      await passcodeRevealByReservationRateLimiter.check(reservationId);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(2);
  });
});
