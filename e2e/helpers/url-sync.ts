import { expect, type Page } from "../fixtures/e2e-test";

/**
 * nuqs の URL 同期（`shallow: false`）が反映されるのを待つ。
 *
 * ## 何を待っているのか
 *
 * `/events` の `EventListFilters` も `/spaces` の `FilterBar` も、facet を
 * `useQueryStates(..., { history: "replace", shallow: false })` で URL に書く。
 * `shallow: false` は **URL 更新にサーバー往復を伴う**という宣言で、しかも
 * 呼び出しは `startTransition` の中にある。したがって順序はこうなる:
 *
 *     入力 → （検索は 300ms デバウンス）→ RSC リクエスト → 応答 → transition コミット → URL が変わる
 *
 * **URL が変わるのはサーバーの応答が届いた後**で、それまで React は
 * transition の作法どおり**古い UI を保持する**。`/events` の RSC は DB を引くので、
 * 混雑した CI runner（2 vCPU に Next の production サーバーと Postgres が同居）
 * では数秒かかる。
 *
 * ## なぜ既定の 5 秒では足りないのか
 *
 * Playwright の assertion 既定（5 秒）は**この操作のために選ばれた値ではない**。
 * 実測 run 32793962158 の `events-filters` は、失敗時のスナップショットが
 *
 * - `searchbox "イベントを検索": ヨガ`（入力は届いている）
 * - `text: 該当 3 件` と 3 件の一覧（**絞り込み前の内容のまま** = transition 未コミット）
 * - URL は `/events`（`q=` なし）
 *
 * という状態で、「壊れている」のではなく**まだ来ていない**ことを示していた。
 * この repo が同種のサーバー往復に与えている予算（予約ウィザードの
 * `STEP_TIMEOUT_MS` = 20 秒）に揃える。
 *
 * ## 入力をやり直してはいけない
 *
 * 「hydration 前に操作が失われたのでは」と考えて `fill` を retry するのは**逆効果**。
 * 300ms のデバウンスが再スタートし、進行中の transition も置き換わるので待ちが
 * 伸びる。そもそも失われてもいない —— client chunk を 3 秒遅らせた probe
 * （JS 47 本を遅延、hydration 完了を確認）でも、1 回だけの `fill` で URL は
 * 正しく更新された。
 */
export const URL_SYNC_TIMEOUT_MS = 20_000;

/** facet 操作が URL に反映されるまで待つ。理由は {@link URL_SYNC_TIMEOUT_MS}。 */
export async function expectUrlSync(
  page: Page,
  pattern: RegExp,
): Promise<void> {
  await expect(page).toHaveURL(pattern, { timeout: URL_SYNC_TIMEOUT_MS });
}
