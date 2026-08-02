import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Stripe の外向き呼び出しに**上限がある**ことと、E2E 側の予算がその値から
 * 導かれていることを機械強制する gate。
 *
 * ## なぜ上限が要るのか
 *
 * 返金は `refundReservationPaymentCommand` の advisory lock（728355）を握った
 * interactive transaction の**内側**で Stripe を呼ぶ。応答が返らない間、その予約に
 * 対する後続の返金・状態遷移は全部待たされ、Prisma の tx timeout にも当たる。
 * SDK 既定の待ちに任せると、外部の詰まりがそのままロック保持時間になる。
 *
 * ## なぜ E2E に効くのか
 *
 * `playwright.config.ts` の webServer chain が **偽の** Stripe 認証情報を
 * `SettingsStripe` に書く（#1828）。`assertOnlinePaymentAvailable` は通るので、
 * `reservation-recurring-series-bulk-cancel-refund.spec.ts` は「認証情報が無くて
 * 即 throw」ではなく**実際に api.stripe.com へ出る**。egress の無い runner では
 * この timeout が唯一の脱出口で、spec の poll 予算もここから逆算する必要がある。
 *
 * spec 側は `src/shared/lib/stripe.ts` を import できない（`import "server-only"`）ので、
 * 値の一致はこの gate でしか守れない。
 */

const root = process.cwd();
const STRIPE = join(root, "src/shared/lib/stripe.ts");
const SPEC = join(
  root,
  "e2e/authenticated/admin/reservation-recurring-series-bulk-cancel-refund.spec.ts",
);

function stripeTimeoutMs(): number {
  const source = readFileSync(STRIPE, "utf8");
  const declared = /const STRIPE_REQUEST_TIMEOUT_MS = ([\d_]+);/u.exec(source);
  if (!declared?.[1]) {
    throw new Error("STRIPE_REQUEST_TIMEOUT_MS の宣言が見つかりません");
  }
  return Number(declared[1].replace(/_/gu, ""));
}

describe("Stripe 呼び出しの上限", () => {
  test("クライアントが timeout を明示している", () => {
    const source = readFileSync(STRIPE, "utf8");

    // 未指定に戻すと、SDK 既定の長い待ちが advisory lock の保持時間になる。
    expect(source).toContain("timeout: STRIPE_REQUEST_TIMEOUT_MS");
    expect(stripeTimeoutMs()).toBeGreaterThan(0);
  });

  test("返金 E2E の予算が Stripe の上限から導かれている", () => {
    const spec = readFileSync(SPEC, "utf8");
    const budget = /const REFUND_PIPELINE_TIMEOUT_MS = 3 \* ([\d_]+)/u.exec(
      spec,
    );
    if (!budget?.[1]) {
      throw new Error("REFUND_PIPELINE_TIMEOUT_MS の宣言が見つかりません");
    }

    // spec は server-only の stripe.ts を import できないので値が二重定義になる。
    // ずれると「実際は 3 回 × 上限まで待つのに予算は短いまま」で偽の失敗になる。
    expect(Number(budget[1].replace(/_/gu, ""))).toBe(stripeTimeoutMs());
  });

  test("test timeout を予算から導いている（手書きの数値でない）", () => {
    const spec = readFileSync(SPEC, "utf8");

    // Playwright 既定の 30 秒は poll 予算より短い。手書きの数値だと予算変更で
    // 片方だけ動く。
    expect(spec).toMatch(
      /test\.describe\.configure\(\{\s*timeout:\s*REFUND_PIPELINE_TIMEOUT_MS/u,
    );
  });

  test("spec が「認証情報が無い」という失効した前提を書いていない", () => {
    const spec = readFileSync(SPEC, "utf8");

    // #1828 で fixture が webServer chain に入り、認証情報は**偽物だが存在する**。
    expect(spec).not.toContain("Stripe credentials が未設定");
    expect(spec).not.toContain("Stripe 未設定");
  });
});
