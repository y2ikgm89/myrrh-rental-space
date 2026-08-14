/**
 * Coupon.usageCount の decrement は `releaseCouponUsage` だけが書いてよい。
 *
 * ## なぜ
 *
 * 予約ドメインの 6 ファイル / 7 箇所が `usageCount: { decrement: 1 }` を直書きして
 * 出荷された。claim 側は `claimCouponUsage` に集約済みで、戻し側だけが
 * `updateMany` + `gt: 0` を各経路にコピーしていた。コピーが 1 箇所でも
 * `gt: 0` を落とすと usageCount が負になり、上限付きクーポンが永久に枯渇する。
 *
 * ## 何を見るか
 *
 * `src/shared/domain/reservations/**\/*.ts` にある
 * `usageCount: { decrement` を探す。許可するのは
 * `export async function releaseCouponUsage` の関数本体だけ。
 *
 * ## 直し方
 *
 * 直書きを消し、`releaseCouponUsage(tx, { couponId })` を呼ぶ。
 * helper 本体を変えるときだけ payloads.ts の関数を編集する。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const TARGET_DIR = `${ROOT}/src/shared/domain/reservations`;

const DECREMENT_PATTERN = /usageCount\s*:\s*\{\s*decrement\b/g;

const HELPER_START = /export\s+async\s+function\s+releaseCouponUsage\b/;

export function findCouponUsageDecrementsOutsideHelper(
  source: string,
): number[] {
  const hits: number[] = [];
  for (const match of source.matchAll(DECREMENT_PATTERN)) {
    const index = match.index ?? 0;
    if (!isInsideReleaseCouponUsage(source, index)) {
      hits.push(index);
    }
  }
  return hits;
}

function isInsideReleaseCouponUsage(source: string, index: number): boolean {
  const fn = source.search(HELPER_START);
  if (fn === -1 || index < fn) return false;
  const open = functionBodyOpenIndex(source, fn);
  if (open === -1 || index < open) return false;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return index <= i;
    }
  }
  return false;
}

/** `releaseCouponUsage(...)` の引数 `{ couponId }` ではなく、本体の `{` を返す。 */
function functionBodyOpenIndex(source: string, fn: number): number {
  const paren = source.indexOf("(", fn);
  if (paren === -1) return -1;
  let depth = 0;
  for (let i = paren; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.indexOf("{", i);
    }
  }
  return -1;
}

function collectReservationSources(): { rel: string; source: string }[] {
  return collectSourceFiles(TARGET_DIR).map((abs) => ({
    rel: relative(ROOT, abs).replaceAll("\\", "/"),
    source: readFileSync(abs, "utf8"),
  }));
}

const RAW_DECREMENT = `
await tx.coupon.updateMany({
  where: { id: couponId, usageCount: { gt: 0 } },
  data: { usageCount: { decrement: 1 } },
});
`;

const HELPER_BODY = `
export async function releaseCouponUsage(tx, { couponId }) {
  await tx.coupon.updateMany({
    where: { id: couponId, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });
}
`;

describe("Coupon.usageCount decrement は releaseCouponUsage だけ", () => {
  test("落ちるべき書き方: helper の外の raw decrement", () => {
    expect(findCouponUsageDecrementsOutsideHelper(RAW_DECREMENT).length).toBe(
      1,
    );
    expect(
      findCouponUsageDecrementsOutsideHelper(`${HELPER_BODY}\n${RAW_DECREMENT}`)
        .length,
    ).toBe(1);
  });

  test("落ちてはいけない書き方: helper 本体と呼び出し", () => {
    expect(findCouponUsageDecrementsOutsideHelper(HELPER_BODY)).toEqual([]);
    expect(
      findCouponUsageDecrementsOutsideHelper(
        "await releaseCouponUsage(tx, { couponId });",
      ),
    ).toEqual([]);
    expect(
      findCouponUsageDecrementsOutsideHelper(
        "data: { usageCount: { increment: 1 } }",
      ),
    ).toEqual([]);
  });

  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(collectReservationSources().length).toBeGreaterThan(30);
  });

  test("reservations ドメインに helper 外の usageCount decrement が無い", () => {
    const offenders = collectReservationSources().flatMap(({ rel, source }) =>
      findCouponUsageDecrementsOutsideHelper(source).map(
        (index) => `${rel}:${String(index)}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
