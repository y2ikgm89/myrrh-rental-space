/**
 * 返金の重複 INSERT が `isPrismaUniqueConstraintError(err, "stripeRefundId")` で
 * 検出できることを**実 DB に対して**確かめる。
 *
 * ## なぜ実 DB でなければならないのか
 *
 * この判定は adapter-pg が返すエラーメタデータの中身と突き合わせる。**中身を
 * 手で書いた fixture で検査しても、fixture が現実からずれた瞬間に意味を失う。**
 *
 * 実害の記録: 物理列名を snake_case へ寄せた 20260804110000〜20260804150000 で
 * adapter-pg が返す `constraint.fields` が `stripe_refund_id` になったが、
 * 単体テストの fixture は `["stripeRefundId"]` を焼いたままだった。結果、
 *
 *   - 本番経路（`payment-claim-orchestration.ts` /
 *     `stripe-refund-orchestration.ts`）は判定が常に false になり、
 *     P2002 を握り潰すはずが throw に変わった
 *   - **単体テストは緑のままだった**
 *
 * 壊れたのは KGI「返金が正しく一度だけ行われる」。throw に変わると Stripe が
 * webhook を再送し続ける。
 *
 * このテストは DB が実際に返す形しか見ないので、fixture が現実からずれる余地が無い。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（runner 経由なら自動注入）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
let prisma: PrismaModule["prisma"];

/** tx を必ず巻き戻すための番兵。refunds は append-only で DELETE できない。 */
const ROLLBACK = "__refund_duplicate_detection_rollback__";

describeMaybe("返金の重複検出（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("同じ stripeRefundId の 2 回目の create を field 名で検出できる", async () => {
    const reservation = await prisma.reservation.findFirst({
      select: { id: true },
    });
    expect(reservation).not.toBeNull();
    if (!reservation) return;

    const stripeRefundId = `re_dup_${crypto.randomUUID()}`;
    // callback の中で代入するため、素の let だと TS が null に絞り込む。
    const observed: { detected: boolean | null; rawError: unknown } = {
      detected: null,
      rawError: null,
    };

    try {
      await prisma.$transaction(async (tx) => {
        const data = {
          reservationId: reservation.id,
          amount: 1,
          refundedByType: "ADMIN",
          status: "succeeded",
          stripeRefundId,
        };
        await tx.refund.create({ data });
        try {
          await tx.refund.create({ data });
        } catch (error) {
          observed.rawError = error;
          // **呼び出し側はアプリの語彙（Prisma field 名）で書く。**
          // 物理列名 `stripe_refund_id` への変換は helper の責務。
          observed.detected = isPrismaUniqueConstraintError(
            error,
            "stripeRefundId",
          );
        }
        throw new Error(ROLLBACK);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
    }

    // 「2 回目が落ちなかった」と「落ちたが検出できなかった」を取り違えない
    expect(observed.rawError).not.toBeNull();
    expect(observed.detected).toBe(true);
  }, 30_000);

  test("別 field を指定した場合は検出しない（silent skip を作らない）", async () => {
    const reservation = await prisma.reservation.findFirst({
      select: { id: true },
    });
    if (!reservation) return;

    const stripeRefundId = `re_dup_${crypto.randomUUID()}`;
    const observed: { detected: boolean | null } = { detected: null };

    try {
      await prisma.$transaction(async (tx) => {
        const data = {
          reservationId: reservation.id,
          amount: 1,
          refundedByType: "ADMIN",
          status: "succeeded",
          stripeRefundId,
        };
        await tx.refund.create({ data });
        try {
          await tx.refund.create({ data });
        } catch (error) {
          observed.detected = isPrismaUniqueConstraintError(
            error,
            "reservationId",
          );
        }
        throw new Error(ROLLBACK);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
    }

    expect(observed.detected).toBe(false);
  }, 30_000);
});
