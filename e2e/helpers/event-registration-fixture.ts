/**
 * イベント申込まわりのグローバル可変状態を seed 直後の形へ戻す helper。
 *
 * `EventRegistration` は共有 test DB のグローバル状態で、公開側の残り枠表示・
 * 管理側の申込一覧 / 当日受付・CSV エクスポートが同じ行を読む。復元は
 * **必ず `afterEach` / `afterAll` から呼ぶ**（test 本体の try/finally は setup 段階の
 * throw で入らない）。
 *
 * UI 経由ではなく DB を直接戻すのは、test 本体が timeout すると page ごと閉じられて
 * hook から画面操作ができないため。
 *
 * @module e2e/helpers/event-registration-fixture
 */

import { getE2EPrismaClient } from "./e2e-prisma";

/**
 * 対象イベントの出欠打刻を全て取り消す。
 *
 * seed（`prisma/seed.ts` の `sampleRegistrations`）は `attendedAt` を設定せずに
 * 申込を作るため、「未出席（`attendedAt: null`）」が復元先の既定値になる。
 * 触った 1 件ではなくイベント単位で揃える（規約どおり「対象全件を既定値に」）。
 */
export async function clearEventCheckInsBySlug(
  eventSlug: string,
): Promise<void> {
  const client = getE2EPrismaClient();
  await client.eventRegistration.updateMany({
    where: { event: { slug: eventSlug }, attendedAt: { not: null } },
    data: { attendedAt: null },
  });
}

/**
 * spec が作った申込行をメールアドレスで削除する。
 *
 * seed に存在しないメールアドレス専用（seed の申込行を巻き込まないこと）。
 */
export async function deleteEventRegistrationsByEmail(
  email: string,
): Promise<void> {
  const client = getE2EPrismaClient();
  await client.eventRegistration.deleteMany({ where: { email } });
}
