/**
 * 繰返し予約**フォーム送信** spec 用の下ごしらえ。
 *
 * この spec は series を fixture で作らない — 作るのは**管理画面のフォーム**で、
 * それが検証対象そのものだから。ここが用意するのは
 *
 * - 専有スペースが空であること（実行前 purge）
 * - フォームの顧客検索で引ける**ゲスト顧客**が居ること
 *
 * の 2 つだけ。
 *
 * ## なぜ実行前 purge が要るか
 *
 * フォーム送信は予約行を増やすので、2 回目の実行は同じ枠を EXCLUDE 制約
 * `reservations_no_active_time_overlap_excl` に弾かれる。CI は `retries: 2` なので
 * **1 度残ると 3 attempt すべてが「その時間帯は既に予約されています」で落ち続け、
 * 本来の失敗理由が見えなくなる**。テスト後ではなく**前**に消すのは、前回が
 * 途中で落ちて後始末が走らなかった場合も回復させるため。
 *
 * ## なぜ専有スペースか
 *
 * `playwright.config.ts` は `fullyParallel: true` で、同一ファイル内の test も
 * worker をまたいで並走する。3 択キャンセル test と同じスペースを使うと、
 * こちらの purge が相手の series を消す。seed が
 * `spaceFixtures.recurringCreateSpaceSlug` を 1 つだけ用意する
 * （`prisma/seed.ts` の `E2E_FIXTURE_SPACES`）。**ここでスペースを作らない**ことは
 * `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が機械強制する。
 *
 * @module e2e/helpers/recurring-create-fixture
 */

import { spaceFixtures } from "../fixtures/test-data";
import { getE2EPrismaClient } from "./e2e-prisma";
import {
  purgeReservationSeriesFixture,
  resolveGuestFixtureCustomerId,
} from "./reservation-series-fixture";

/**
 * この spec が専有するゲスト顧客。
 *
 * 3 択キャンセル fixture の顧客と分ける。フォームの顧客検索は email の部分一致で
 * 引くので（`searchCustomers`）、共有すると「どちらの顧客を選んだか」が
 * 検索結果の並び次第になる。
 */
const RECURRING_CREATE_CUSTOMER_EMAIL = "e2e-recurring-create@example.com";

export interface RecurringCreateFixture {
  readonly spaceId: string;
  /** フォームのスペース選択肢を引くための表示名（seed が持つ名前）。 */
  readonly spaceName: string;
  readonly customerId: string;
  /** 顧客検索ボックスに入れる文字列。 */
  readonly customerEmail: string;
}

/**
 * 専有スペースを空にして、フォームから選べる顧客を揃える。
 *
 * retry でも再実行でも同じ状態から始まる。
 */
export async function prepareRecurringCreateFixture(): Promise<RecurringCreateFixture> {
  const client = getE2EPrismaClient();
  const spaceSlug = spaceFixtures.recurringCreateSpaceSlug;

  await purgeReservationSeriesFixture(spaceSlug);

  const space = await client.space.findFirstOrThrow({
    where: { slug: spaceSlug, isActive: true },
    select: { id: true, name: true },
  });

  const customerId = await resolveGuestFixtureCustomerId({
    email: RECURRING_CREATE_CUSTOMER_EMAIL,
    lastName: "定期予約作成E2E",
    firstName: "花子",
  });

  return {
    spaceId: space.id,
    spaceName: space.name,
    customerId,
    customerEmail: RECURRING_CREATE_CUSTOMER_EMAIL,
  };
}

/**
 * 専有スペースに作られた series と instance 件数を読む。
 *
 * 成否の判定は**トーストや pending 状態ではなく DB** で行う（クライアント側の
 * 合図は Server Action の完了より先に消えるため、押せたことしか証明しない）。
 */
export async function readRecurringCreateResult(spaceId: string): Promise<{
  readonly seriesCount: number;
  readonly instanceCount: number;
  readonly rrules: readonly string[];
}> {
  const client = getE2EPrismaClient();
  const series = await client.reservationSeries.findMany({
    where: { spaceId },
    select: { id: true, rrule: true },
  });
  const instanceCount = await client.reservation.count({
    where: { spaceId, deletedAt: null },
  });

  return {
    seriesCount: series.length,
    instanceCount,
    rrules: series.map((s) => s.rrule),
  };
}
