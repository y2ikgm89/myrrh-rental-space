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
 * ## seed に依存しない
 *
 * 必要な行（拠点 → スペース → 顧客 → 予約）はこのテストが自分で作る。
 * **CI の test DB は migrate 済みだが seed されていない**ので、既存行を
 * `findFirst` で拾う書き方は CI でだけ落ちる。「無ければ skip」にすると
 * CI で一度も実行されないまま緑になる — それはこのテストが潰そうとしている
 * 「通っているが何も守っていない」状態そのものなので、取らない。
 *
 * 後始末はトランザクションの巻き戻しで行う（`refunds` は append-only で
 * DELETE できない）。
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
type TransactionClient = Parameters<
  Parameters<PrismaModule["prisma"]["$transaction"]>[0]
>[0];

let prisma: PrismaModule["prisma"];

/** tx を必ず巻き戻すための番兵。 */
const ROLLBACK = "__refund_duplicate_detection_rollback__";

/** 予約 1 件を作るのに必要な行を tx 内で揃える。巻き戻すので後始末は要らない。 */
async function createReservation(tx: TransactionClient): Promise<string> {
  const suffix = crypto.randomUUID();
  const location = await tx.location.create({
    data: {
      slug: `refund-dup-loc-${suffix}`,
      name: `Refund Dup Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: 0,
      // `locations_active_sort_order_key` は `isActive: true` の行だけを対象にする
      // partial unique。非公開で作れば sortOrder が既存行と衝突しない。
      isActive: false,
    },
    select: { id: true },
  });
  const space = await tx.space.create({
    data: {
      slug: `refund-dup-space-${suffix}`,
      name: `Refund Dup Space ${suffix}`,
      descriptionJson: {},
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });
  const customer = await tx.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `refund-dup-${suffix}@example.com`,
      emailCanonical: `refund-dup-${suffix}@example.com`,
    },
    select: { id: true },
  });
  const reservation = await tx.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      // 遠未来 + ランダム日付。EXCLUDE 制約（同一スペースの時間重複）は
      // スペースごと新規なので衝突しない。
      startTime: new Date("2099-01-01T10:00:00.000Z"),
      endTime: new Date("2099-01-01T12:00:00.000Z"),
      status: "CONFIRMED",
      basePrice: 1000,
      totalPrice: 1000,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: 1000,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 100,
      totalPriceWithTax: 1100,
      guestLastName: "山田",
      guestFirstName: "太郎",
      guestEmail: `refund-dup-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return reservation.id;
}

/**
 * 同じ `stripeRefundId` で 2 回 create し、2 回目の error を
 * 指定した field 名で判定した結果を返す。tx は必ず巻き戻す。
 */
async function detectDuplicate(
  targetField: string,
): Promise<{ detected: boolean | null; rawError: unknown }> {
  // callback の中で代入するため、素の let だと TS が null に絞り込む。
  const observed: { detected: boolean | null; rawError: unknown } = {
    detected: null,
    rawError: null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const reservationId = await createReservation(tx);
      const data = {
        reservationId,
        amount: 1,
        refundedByType: "ADMIN",
        status: "succeeded",
        stripeRefundId: `re_dup_${crypto.randomUUID()}`,
      } as const;
      await tx.refund.create({ data });
      try {
        await tx.refund.create({ data });
      } catch (error) {
        observed.rawError = error;
        observed.detected = isPrismaUniqueConstraintError(error, targetField);
      }
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }

  return observed;
}

describeMaybe("返金の重複検出（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("同じ stripeRefundId の 2 回目の create を field 名で検出できる", async () => {
    // **呼び出し側はアプリの語彙（Prisma field 名）で書く。**
    // 物理列名 `stripe_refund_id` への変換は helper の責務。
    const observed = await detectDuplicate("stripeRefundId");

    // 「2 回目が落ちなかった」と「落ちたが検出できなかった」を取り違えない
    expect(observed.rawError).not.toBeNull();
    expect(observed.detected).toBe(true);
  }, 30_000);

  test("別 field を指定した場合は検出しない（silent skip を作らない）", async () => {
    const observed = await detectDuplicate("reservationId");

    expect(observed.rawError).not.toBeNull();
    expect(observed.detected).toBe(false);
  }, 30_000);
});
