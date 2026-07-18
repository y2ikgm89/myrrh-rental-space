/**
 * `receiptDownloadBySerialNoRateLimiter` — 領収書 PDF DL の per-serialNo 第二防壁 (HTTP-03).
 *
 * proxy.ts の checkRateLimit は汎用 apiRateLimiter (100/min/IP) のみで、同一 serialNo への
 * brute-force / usedAt 焼き潰し DoS が抜ける。`cancelByReservationRateLimiter` と同型の
 * 「resource (serialNo) 単位の第二防壁」として 10 attempts/hour/serialNo を敷く。
 *
 * 本テストは以下を verify する:
 *   1. 同一 serialNo に対する 10 回目までのリクエストは全て success
 *   2. 11 回目のリクエストは blocked (success: false, remaining: 0)
 *   3. 異なる serialNo は独立してカウントされる (単一 receipt の攻撃が別 receipt に波及しない)
 *   4. reset で bucket がクリアされる
 */

import { describe, expect, test } from "bun:test";
import { receiptDownloadBySerialNoRateLimiter } from "@/shared/lib/rate-limit";

describe("receiptDownloadBySerialNoRateLimiter", () => {
  test("同一 serialNo の 10 回目までは success", async () => {
    const serialNo = "2026-000001-ok-under-limit";
    for (let i = 0; i < 10; i += 1) {
      const result = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(10 - (i + 1));
    }
  });

  test("同一 serialNo の 11 回目は blocked", async () => {
    const serialNo = "2026-000002-blocked-at-eleventh";
    for (let i = 0; i < 10; i += 1) {
      const result = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
      expect(result.success).toBe(true);
    }

    const blocked = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Date.now());
  });

  test("異なる serialNo は独立してカウントされる", async () => {
    const a = "2026-000003-independent-bucket-a";
    const b = "2026-000004-independent-bucket-b";

    // a を上限まで焼く
    for (let i = 0; i < 10; i += 1) {
      const r = await receiptDownloadBySerialNoRateLimiter.check(a);
      expect(r.success).toBe(true);
    }
    const aBlocked = await receiptDownloadBySerialNoRateLimiter.check(a);
    expect(aBlocked.success).toBe(false);

    // b はまだ 10 回まで通る (a の状態に影響されない)
    const bFirst = await receiptDownloadBySerialNoRateLimiter.check(b);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(9);
  });

  test("reset(serialNo) で bucket がクリアされる", async () => {
    const serialNo = "2026-000005-reset-recovers";
    for (let i = 0; i < 10; i += 1) {
      await receiptDownloadBySerialNoRateLimiter.check(serialNo);
    }
    const blocked = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
    expect(blocked.success).toBe(false);

    await receiptDownloadBySerialNoRateLimiter.reset(serialNo);

    const afterReset =
      await receiptDownloadBySerialNoRateLimiter.check(serialNo);
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(9);
  });

  test("reset 時刻は 1 時間先 (interval = 60 * 60 * 1000)", async () => {
    const serialNo = "2026-000006-reset-time-window";
    const before = Date.now();
    const result = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
    // interval = 3,600,000ms を許容 (実行遅延 ±100ms を吸収)
    expect(result.reset).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 100);
    expect(result.reset).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 100);
  });
});
