/**
 * Stripe 返金の idempotency key は `buildPaymentRefundIdempotencyKey` だけが書いてよい。
 *
 * ## なぜ
 *
 * N-02: `reservation-refund-{id}-{newCumulative}` だけだと、failed/canceled が
 * 集計から外れたあと同額再試行が同一キーになり、Stripe が初回の失敗応答を
 * 最低 24h replay する。自動返金経路だけ旧形式が残り、再試行不能になった。
 *
 * ## 何を見るか
 *
 * `src/shared/domain/**\/*.ts` にある
 * `` `reservation-refund-${ `` / `` `event-registration-refund-${ `` の直書き。
 * helper は prefix を引数で受けて結合するだけなので、このテンプレには現れない。
 *
 * ## 直し方
 *
 * `buildPaymentRefundIdempotencyKey({ prefix, entityId, newCumulative, excludedAttemptCount })`
 * を呼ぶ。キー形式を変えるときだけ stripe-refund-orchestration.ts の helper を編集する。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, "src", "shared", "domain");

const RAW_KEY_PATTERN = /`(?:reservation-refund|event-registration-refund)-\$/g;

export function findRawPaymentRefundIdempotencyKeys(source: string): number[] {
  return [...source.matchAll(RAW_KEY_PATTERN)].map((match) => match.index ?? 0);
}

function collectDomainSources(): { rel: string; source: string }[] {
  return collectSourceFiles(TARGET_DIR).map((abs) => ({
    rel: relative(ROOT, abs).replaceAll("\\", "/"),
    source: readFileSync(abs, "utf8"),
  }));
}

const RAW_KEY = `
idempotencyKey: \`reservation-refund-\${reservationId}-\${reservation.totalPriceWithTax}\`,
`;

const HELPER_CALL = `
idempotencyKey: buildPaymentRefundIdempotencyKey({
  prefix: "reservation-refund",
  entityId: reservationId,
  newCumulative: reservation.totalPriceWithTax,
  excludedAttemptCount,
}),
`;

describe("返金 idempotency key は buildPaymentRefundIdempotencyKey だけ", () => {
  test("落ちるべき書き方: prefix を埋め込んだ template literal", () => {
    expect(findRawPaymentRefundIdempotencyKeys(RAW_KEY).length).toBe(1);
    expect(
      findRawPaymentRefundIdempotencyKeys(
        "idempotencyKey: `event-registration-refund-${registrationId}-${amount}`",
      ).length,
    ).toBe(1);
  });

  test("落ちてはいけない書き方: helper 呼び出しと別 prefix", () => {
    expect(findRawPaymentRefundIdempotencyKeys(HELPER_CALL)).toEqual([]);
    expect(
      findRawPaymentRefundIdempotencyKeys(
        "idempotencyKey: `reservation-amount-mismatch-refund-${reservationId}`",
      ),
    ).toEqual([]);
    expect(
      findRawPaymentRefundIdempotencyKeys(
        "return `${input.prefix}-${input.entityId}-${input.newCumulative}-${input.excludedAttemptCount}`;",
      ),
    ).toEqual([]);
  });

  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(collectDomainSources().length).toBeGreaterThan(200);
  });

  test("domain に返金 idempotency key の直書きが無い", () => {
    const offenders = collectDomainSources().flatMap(({ rel, source }) =>
      findRawPaymentRefundIdempotencyKeys(source).map(
        (index) => `${rel}:${String(index)}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
