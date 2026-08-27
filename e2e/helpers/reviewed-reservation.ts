/**
 * seed が `SpaceReview` を付けた dev customer の完了予約を **id で**指す。
 *
 * ## なぜ必要か
 *
 * `reservation-test-helpers.ts` の `customerReservationTargets` はステータスの
 * 正規表現 + `.first()` で予約を拾う。あれは「そのステータスの予約詳細で UI が
 * 成立すること」を見る spec のための仕組みで、同ファイルの JSDoc が
 * **「特定の予約を指す必要が出た場合は fixture 側に識別子を持たせること」**
 * と書いている。
 *
 * レビュー表示の spec は「`SpaceReview` が付いている**その予約**」を要求するので、
 * 一覧の並び順に賭けてはいけない。実害: 同じ notes の予約が 2 件になったとき
 * （seed が消せない行を retain したまま宣言を作り直していた。PR #2742 で修正）
 * 片方にしかレビューが付かず、`.first()` がレビュー無しを引いて
 * **invocation 単位で 10/10 落ちたり 10/10 通ったり**していた。
 */
import { getE2EPrismaClient } from "./e2e-prisma";

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";

/**
 * seed（`prisma/seed.ts` の `seedDevCustomerAndReservations`）が `SpaceReview` を
 * 付ける予約の notes marker。seed と二重定義なので seed 変更時は同時に更新する
 * （`customer-merge-fixture.ts` の `GUEST_MERGE_RESERVATION_MARKER` と同じ扱い）。
 */
const REVIEWED_RESERVATION_MARKER = "[E2E] 過去・決済済み";

export async function getReviewedCustomerReservationId(): Promise<string> {
  const client = getE2EPrismaClient();

  const review = await client.spaceReview.findFirst({
    where: {
      customer: { email: DEV_CUSTOMER_EMAIL },
      reservation: {
        status: "COMPLETED",
        notes: { contains: REVIEWED_RESERVATION_MARKER },
      },
    },
    // seed は 1 件しか作らないが、`orderBy` を省くと物理順に依存する。
    orderBy: { createdAt: "asc" },
    select: { reservationId: true },
  });

  if (!review) {
    throw new Error(
      `SpaceReview 付きの dev customer 完了予約が見つからない（seed の "${REVIEWED_RESERVATION_MARKER}" を確認）`,
    );
  }

  return review.reservationId;
}
