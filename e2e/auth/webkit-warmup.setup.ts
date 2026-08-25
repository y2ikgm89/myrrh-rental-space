import { test as setup, expect } from "../fixtures/e2e-test";

/**
 * WebKit の**ブラウザ起動コストを test の予算の外へ出す** setup project。
 *
 * ## なぜ要るのか
 *
 * Playwright は browser の起動を「その worker で最初にそのブラウザを使う test」の
 * fixture setup として実行し、**test timeout に算入する**。`webkit-*-mobile` は
 * どれも test 1 本しか持たないので、起動コストがまるごとその 1 本に乗る。
 *
 * 実測（run 32793962158、`workers: 1` なので同じ worker・同じ browser を共有）:
 *
 * | project | 実行時間 | 備考 |
 * | --- | --- | --- |
 * | `webkit-customer-mobile` | **10.8s** | この run で最初の WebKit test |
 * | `webkit-admin-mobile` | **3.7s** | 起動済みの browser を再利用 |
 *
 * 差の約 7 秒が起動コスト。負荷の高い runner ではこれが跳ね、`newContext` の
 * 完了前に 30 秒の test timeout に達して
 * `Test timeout exceeded while setting up "context"` で落ちていた（run 32402401449）。
 *
 * ## なぜ timeout を伸ばすのではないのか
 *
 * かつては project の `timeout` を 60 秒へ伸ばして通していた（`9ffe62cbf`）。
 * それは**起動コストを test の予算に居座らせたまま予算だけ広げる**形で、
 * 「その test が遅いのか harness が遅いのか」を区別できなくする。
 *
 * ここで先に起動を済ませれば、**test 側の予算は既定の 30 秒のままでよい**。
 * 広い予算が要るのはこの setup だけで、それは起動だけを担当する step だから
 * 正当化できる。
 *
 * ## 成立条件
 *
 * `workers: 1`（`playwright.config.ts`）であること。browser は **worker ごと**に
 * 使い回されるので、setup と本体が同じ worker に載る保証がないと効かない。
 * worker を増やすなら、この setup は無意味になる。
 *
 * `use` の device / viewport は context の設定であって launch の設定ではないため、
 * 本体 project と揃える必要はない（同じ browser が再利用される）。
 *
 * @see https://playwright.dev/docs/test-projects
 */
setup("warm up the webkit browser", async ({ page }) => {
  // ページの中身はどうでもよい。**browser が起動したこと**が成果物。
  // アプリを踏まないので、サーバーの状態にも seed にも依存しない。
  await page.goto("about:blank");

  // 温めたブラウザが本当に WebKit であることを確かめる。project の
  // `browserName` を取り違えると、無関係な browser を温めて何も解決しないまま
  // 緑になる（この setup が空振りする唯一の形）。
  expect(page.context().browser()?.browserType().name()).toBe("webkit");
});
