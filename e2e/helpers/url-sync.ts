import { expect, type Page } from "../fixtures/e2e-test";

/**
 * nuqs の URL 同期（`shallow: false`）が反映されるのを待つ。
 *
 * ## 何を待っているのか
 *
 * `/events` の `EventListFilters` も `/spaces` の `FilterBar` も、facet を
 * `useQueryStates(..., { history: "replace", shallow: false })` で URL に書く。
 *
 * **URL の書き換えはサーバー往復を待たない。** nuqs は `history.replaceState` を
 * **同期で先に**呼び、`router.replace()` による RSC 再取得はその後に走る
 * （`node_modules/nuqs/dist/impl.app-*.js`）。実測でも、サーバー応答を 5 秒
 * 遅らせた条件で URL は `fill` の 311ms 後（＝ 300ms デバウンスの直後）に
 * 変わり、一覧が絞り込まれたのはその 7 秒後だった。
 *
 * したがってこの assertion が待つのは
 *
 *     入力 → （検索は 300ms デバウンス）→ URL が変わる
 *
 * であって、RSC の往復ではない。
 *
 * ## 予算を 20 秒にしている理由
 *
 * 混雑した CI runner（2 vCPU に Next の production サーバーと Postgres が同居）
 * では、デバウンスのタイマーと transition のスケジュールが実時間で伸びる。
 * この repo が同種の操作に与えている予算（予約ウィザードの `STEP_TIMEOUT_MS`
 * = 20 秒）に揃えてある。
 *
 * **ここを伸ばして直る種類の失敗ばかりではない。** かつて `events-filters` の
 * 失敗をこの予算不足と診断して 5 秒 → 20 秒に伸ばしたが、直らなかった。
 * 真因は水和前に打った入力が React に届かないことで、**状態が固定されるので
 * いくら待っても来ない**（`src/app/(public)/_shared/hooks/use-adopt-prehydration-input.ts`
 * の JSDoc に機序と一次資料）。
 *
 * この assertion が落ちたら、まず**待てば来るのか**を疑う。error context の
 * スナップショットで「入力欄に文字があるのに一覧が絞り込まれていない」なら、
 * それは待ち不足ではない。
 */
export const URL_SYNC_TIMEOUT_MS = 20_000;

/** facet 操作が URL に反映されるまで待つ。理由は {@link URL_SYNC_TIMEOUT_MS}。 */
export async function expectUrlSync(
  page: Page,
  pattern: RegExp,
): Promise<void> {
  await expect(page).toHaveURL(pattern, { timeout: URL_SYNC_TIMEOUT_MS });
}
