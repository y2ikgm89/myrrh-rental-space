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

/**
 * 判定を純粋関数として切り出す（監査 A-52）。
 *
 * 判定器に見本が無いと、正規表現を**何にもマッチしない形へ変異**させても
 * （タイポや「coupon.update を helper に切り出したので名前を変えた」程度の
 * リファクタで起きる）offender が 0 件なので全ケースが緑のまま通る。
 * 判定器が壊れていることと違反が無いことを区別できない。
 */
function findNaiveCouponUsageCountWrite(
  source: string,
): RegExpExecArray | null {
  return BANNED_PATTERN.exec(source);
}

describe("reservation domain: Coupon.usageCount writes are atomic-claim", () => {
  /**
   * 走査集合そのものの下限（監査 A-51）。
   *
   * `globSync` は存在しない cwd でも throw せず `[]` を返し、`test.each([])` は
   * テストを 1 本も生成しない。`src/shared/domain/reservations/` を移動・改名する
   * リファクタで `TARGET_DIR` が古いパスのままになると、ファイルは
   * `1 pass / 0 fail` で緑になる（実測済み）。
   */
  test("gate が空振りしていない（走査件数の下限）", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("落ちるべき書き方: 素の increment / decrement", () => {
    expect(
      findNaiveCouponUsageCountWrite(
        "await tx.coupon.update({ where: { id }, data: { usageCount: { increment: 1 } } });",
      ),
    ).not.toBeNull();
    expect(
      findNaiveCouponUsageCountWrite(
        [
          "await prisma.coupon.update({",
          "  where: { id: couponId },",
          "  data: { usageCount: { decrement: 1 } },",
          "});",
        ].join("\n"),
      ),
    ).not.toBeNull();
  });

  test("落ちてはいけない書き方: claim helper とガード付き updateMany", () => {
    // 正規経路 1: 有効期限と usageLimit を WHERE に含む claim。
    expect(
      findNaiveCouponUsageCountWrite("await claimCouponUsage(tx, couponId);"),
    ).toBeNull();
    // 正規経路 2: 解放は usageCount: { gt: 0 } を WHERE に含む updateMany。
    expect(
      findNaiveCouponUsageCountWrite(
        "await tx.coupon.updateMany({ where: { id, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });",
      ),
    ).toBeNull();
    // 別モデルの usageCount は対象外。
    expect(
      findNaiveCouponUsageCountWrite(
        "await tx.couponUsage.update({ where: { id }, data: { usageCount: { increment: 1 } } });",
      ),
    ).toBeNull();
  });

  test.each(files)(
    "%s :: no naive coupon.update(increment/decrement)",
    (rel) => {
      const abs = resolve(TARGET_DIR, rel);
      const source = readFileSync(abs, "utf8");
      const match = findNaiveCouponUsageCountWrite(source);
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
