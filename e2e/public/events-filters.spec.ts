import { test, expect, type Page } from "../fixtures/e2e-test";
import { urls, eventCategoryFixtures } from "../fixtures";
import { expectUrlSync } from "../helpers/url-sync";

/**
 * 公開サイト - /events 検索性向上 UI E2E
 *
 * 責務: `eventsListSearchParamsParsers` の URL → UI 双方向反映を pin する。
 * tab/q/categoryId の Prisma 変換ロジックは
 * `__tests__/unit/domain/events/public-queries.test.ts` が担当。
 *
 * **`getByLabel` を使わない。** React streaming の hidden staging container が
 * 同じ input を一時的に 2 つ存在させるため strict-mode violation になる
 * （実測: `getByLabel('イベントを検索') resolved to 2 elements`。a11y ツリーには
 * 1 つしか出ない）。role locator は `includeHidden: false` が既定なので
 * staging copy を構造的に掴まない。理由の全文は
 * `e2e/helpers/streaming-safe-locators.ts`。
 *
 * **URL 反映の待ちは `expectUrlSync` を使う。** 理由と実測は
 * `e2e/helpers/url-sync.ts`。
 *
 * **水和前の操作は 3 本ある。** chunk 遅延で水和前の窓を作るテスト（検索欄 /
 * カテゴリー select / タブ）。通常実行では修正前でも通るので、**新旧を
 * 判別できるのはこの 3 本だけ**。3 つとも直し方が違う: `<input>` は value
 * tracker、`<select>` は updateOptions の書き戻し、タブは痕跡が残らないので
 * 採用ではなく実リンク化（各テストの JSDoc）。
 */

/**
 * タブは nav に絞る。**カードにも「終了」というテキストがある**（イベントの
 * 開催状況バッジ）ので、`getByRole("link", { name: "終了" })` を素で使うと
 * `tab=past` のページで 11 件に当たって strict mode violation になる。
 * リンク化する前は button だったので一意だった — 実際にこれで落ちた。
 */
function tabLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "開催状況" }).getByRole("link", {
    name,
  });
}

test.describe("/events findability — URL 双方向反映", () => {
  test("root で開催予定タブが現在地、検索欄とカテゴリー select が描画される", async ({
    page,
  }) => {
    const res = await page.goto(urls.events);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(tabLink(page, "開催予定")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabLink(page, "終了")).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "イベントを検索" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "カテゴリー" }),
    ).toBeVisible();
  });

  test("?tab=past で終了タブが選択状態になる", async ({ page }) => {
    await page.goto(`${urls.events}?tab=past`);
    await expect(tabLink(page, "終了")).toHaveAttribute("aria-current", "page");
  });

  test("終了タブをクリックすると URL の tab=past に反映される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    await tabLink(page, "終了").click();
    await expectUrlSync(page, /[?&]tab=past/);
  });

  test("検索欄に入力すると URL の q に反映され値が保持される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    const searchInput = page.getByRole("searchbox", {
      name: "イベントを検索",
    });
    await searchInput.fill("ヨガ");
    await expectUrlSync(page, /[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  /**
   * **水和前に打った文字が失われないこと。**
   *
   * SSR された検索欄は client JS が走る前から操作できる。そこへ入った文字は
   * DOM には残るが React の `onChange` には届かず、React は水和時にその
   * 食い違いを直さない（`initInput` の `isHydrating` 短絡）。結果は
   * 「文字は見えているのに絞り込まれない」という**終端状態**で、待っても
   * 直らない。実際に nightly を赤くしていたのはこれで、
   * `URL_SYNC_TIMEOUT_MS` を 5 秒から 20 秒へ伸ばしても直らなかった。
   *
   * chunk を 3 秒遅らせて `waitUntil: "commit"` で戻ることで、**水和前の
   * 窓を強制的に作る**。CI の速さに依存しないので flaky にならない。
   * 通常実行（遅延なし）では修正前でも通ってしまうため、この形でしか
   * 新旧を判別できない。
   *
   * 落ちたら `useAdoptPrehydrationInput` の `ref` が外れている。
   * **待ち時間を伸ばして直そうとしない。**
   */
  test("水和前に打った文字も URL の q に反映される", async ({ page }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // `waitUntil: "commit"` で HTML が届いた時点で戻る。既定の "load" は
    // 上で遅らせた当の chunk を待つので、水和前の窓を踏めない。
    await page.goto(urls.events, { waitUntil: "commit" });

    const searchInput = page.getByRole("searchbox", {
      name: "イベントを検索",
    });
    await searchInput.fill("ヨガ");

    await expectUrlSync(page, /[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  test(`?categoryId で「${eventCategoryFixtures.workshopName}」が select に反映される`, async ({
    page,
  }) => {
    await page.goto(urls.events);
    const select = page.getByRole("combobox", { name: "カテゴリー" });
    const optionValue = await select
      .locator("option", { hasText: eventCategoryFixtures.workshopName })
      .getAttribute("value");
    expect(optionValue).toBeTruthy();

    await page.goto(`${urls.events}?categoryId=${optionValue}`);
    await expect(select).toHaveValue(optionValue ?? "");
  });

  /**
   * **水和前に選んだ option が失われないこと。**
   *
   * `<select>` は input と**別の機序**で壊れる。react-dom 19.2.8 の水和経路は
   * `case "input"` では `initInput(..., isHydrating)` と `track()` を呼ぶが、
   * `case "select"` ではどちらも呼ばない（`react-dom-client.development.js`
   * の同 switch を実確認）。よって value tracker に封じ込められることは無い
   * 代わりに、次の再レンダーで `updateOptions` が props 側の値を DOM へ
   * 書き戻す。ユーザーから見ると「絞り込んだはずが無言で全件に戻る」。
   *
   * 上の検索欄のテストと同じく chunk を 3 秒遅らせて水和前の窓を作る。
   * 落ちたら `<Select>` から `ref={categoryRef}` が外れている。
   */
  test("水和前に選んだカテゴリーも URL の categoryId に反映される", async ({
    page,
  }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.goto(urls.events, { waitUntil: "commit" });

    const select = page.getByRole("combobox", { name: "カテゴリー" });
    // option は SSR 済みなので、水和前でも値を読んで選べる。
    const optionValue = await select
      .locator("option", { hasText: eventCategoryFixtures.workshopName })
      .getAttribute("value");
    expect(optionValue).toBeTruthy();

    await select.selectOption(optionValue ?? "");

    await expectUrlSync(page, /[?&]categoryId=/);
    await expect(select).toHaveValue(optionValue ?? "");
  });

  /**
   * **水和前に押したタブが効くこと。**
   *
   * 検索欄や select は「打たれた値が DOM に残る」ので水和後に突き合わせて
   * 拾えるが、**クリックは DOM に痕跡を残さない**。`<button onClick>` のままでは
   * 原理的に拾えず、水和前の押下は無かったことになる。
   *
   * 直し方は採用ではなく **progressive enhancement**: `href` を持つ実リンクに
   * すれば、水和前のクリックはブラウザのナビゲーションになるので JS の有無に
   * 関係なく必ず効く。
   *
   * 落ちたらタブが `<Link href>` から `<button onClick>` へ戻っている。
   */
  test("水和前に押したタブも tab=past に反映される", async ({ page }) => {
    await page.route(/\/_next\/static\/chunks\/.*\.js$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.goto(urls.events, { waitUntil: "commit" });

    // 水和前なので click は React ではなくブラウザのリンク遷移として処理される。
    await tabLink(page, "終了").click();

    await expectUrlSync(page, /[?&]tab=past/);
  });
});
