/**
 * reservation lifecycle 内の Coupon.usageCount 書込は必ず atomic claim パターンを使う。
 *
 * # 禁止パターン
 *
 *   tx.coupon.update({
 *     where: { id: ... },
 *     data: { usageCount: { increment: 1 } },
 *   })
 *
 * ↑ 素の update は usageLimit cap を検証せず over-use を silently 許す。
 *
 * # 許可パターン
 *
 *   claimCouponUsage(tx, { couponId, basePrice })  // payloads.ts
 *     → $executeRaw UPDATE ... WHERE isActive + usageLimit + validFrom/Until + minAmount
 *   tx.coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })
 *
 * increment は claimCouponUsage（validity 込み）で強制、decrement は updateMany + gt:0 guard。
 *
 * # gate 対象
 *
 * `src/shared/domain/reservations/**\/*.ts` 全体を対象にする。既存の
 * public-commands / admin-commands / lifecycle-commands / payment-commands
 * などが全部この規約に従うことを保証する。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const TARGET_DIR = resolve(
  REPO_ROOT,
  "src",
  "shared",
  "domain",
  "reservations",
);

const files = globSync("**/*.ts", { cwd: TARGET_DIR });

/**
 * `tx.coupon.update(...)` and `prisma.coupon.update(...)` (non-Many) whose
 * data block references usageCount are the drift target. The regex captures:
 *   <ident>.coupon.update({...usageCount:...})
 * within a modest window so it does not stall on huge files.
 */
const BANNED_PATTERN =
  /\b(?:tx|prisma)\.coupon\.update\s*\(\s*\{[\s\S]{0,400}?usageCount\s*:\s*\{\s*(increment|decrement)/m;

describe("reservation domain: Coupon.usageCount writes are atomic-claim", () => {
  test.each(files)(
    "%s :: no naive coupon.update(increment/decrement)",
    (rel) => {
      const abs = resolve(TARGET_DIR, rel);
      const source = readFileSync(abs, "utf8");
      const match = BANNED_PATTERN.exec(source);
      if (match) {
        // Provide a helpful message: quote up to 200 chars around the match
        // so the failing regression is obvious in test output.
        const start = Math.max(0, match.index - 40);
        const end = Math.min(source.length, match.index + 200);
        const snippet = source.slice(start, end).replace(/\s+/g, " ").trim();
        throw new Error(
          `${rel}: naive coupon.update({ usageCount: { increment/decrement } }) is banned. ` +
            `Use claimCouponUsage (validity + usageLimit) for increment, or updateMany({ where: { usageCount: { gt: 0 } } }) for decrement. ` +
            `Context: …${snippet}…`,
        );
      }
      expect(match).toBeNull();
    },
  );
});
