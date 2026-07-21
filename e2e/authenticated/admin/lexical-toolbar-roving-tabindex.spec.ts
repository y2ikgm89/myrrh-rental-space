import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * 管理画面 - Lexical ToolbarPlugin ロービングタブインデックス E2E（管理者認証済み state）
 *
 * WAI-ARIA APG の toolbar pattern（https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/）
 * に準拠したキーボード操作契約を、`radix-ui` 経由の `@radix-ui/react-toolbar`
 * （Toolbar.Root / Toolbar.Button）実装に対して検証する。
 *
 * 検証する契約:
 *   (a) toolbar へのフォーカス進入は 1 ストップ（Tab キーで直接ボタンに着地する）
 *   (b) ArrowRight/ArrowLeft でボタン間を移動できる
 *   (c) disabled なボタン（新規ドキュメントでは元に戻す/やり直す）は
 *       矢印キーのロービング対象から除外される（ループ時もスキップ）
 *   (d) Home/End で先頭/末尾の有効なボタンに移動する
 *   (e) axe スキャンが通る
 *
 * 設計:
 *   - (a) は実ページ内の無関係なヘッダー/ナビの Tab 順に依存すると
 *     周辺 UI 変更で壊れるため、toolbar コンテナ自体に `.focus()` する。
 *     Radix RovingFocusGroup はコンテナへの entry focus を検知すると
 *     同期的に最初の focusable item へ redirect するため、これは実際の
 *     Tab キー到達（コンテナ tabIndex=0 → 即座に子ボタンへ redirect）と
 *     同じ内部ロジックを exercise する
 *   - 新規投稿ページは編集履歴が無いため「元に戻す」「やり直す」が初期状態で
 *     disabled。これを (c) の固定 fixture として利用する
 *   - 「全画面表示にする」ボタンは ToolbarPlugin の DOM 順で常に最後の
 *     roving item（InsertSection/LayoutToolbarSection の条件付き表示に
 *     依存しない）ため、末尾到達の固定 fixture として利用する
 *   - 前提: playwright.config.ts の chromium-admin project、setup-admin で
 *     admin user が認証済み、dev サーバー（webServer）稼働
 */

const NEW_POST_PATH = "/admin/posts/new";
const TOOLBAR_NAME = "書式・挿入・書き出し";

test.describe("Lexical ToolbarPlugin - roving tabindex（WAI-ARIA APG toolbar pattern）", () => {
  test("toolbar は role=toolbar + data-orientation=horizontal で描画され、disabled ボタンは tabindex=-1", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    await expect(toolbar).toHaveAttribute("data-orientation", "horizontal");

    // 新規ドキュメントは編集履歴が無いため両方 disabled = roving 対象外
    await expect(
      toolbar.getByRole("button", { name: "元に戻す" }),
    ).toHaveAttribute("tabindex", "-1");
    await expect(
      toolbar.getByRole("button", { name: "やり直す" }),
    ).toHaveAttribute("tabindex", "-1");
  });

  test("toolbar へのフォーカス進入は 1 ストップ: 最初の有効なボタン（太字）に直接着地する", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    await toolbar.focus();

    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "太字");
  });

  test("ArrowRight/ArrowLeft でボタン間を移動できる", async ({ page }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    await toolbar.getByRole("button", { name: "太字" }).click();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "太字");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "斜体");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "下線");

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "斜体");
  });

  test("disabled な元に戻す/やり直すは矢印キーのロービング対象から除外される（ループ時もスキップ）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // 太字は元に戻す/やり直すの直後（DOM 順で先頭寄り）にある有効なボタン。
    // ここから ArrowLeft を押すと、disabled な2つを除外して末尾へループする。
    await toolbar.getByRole("button", { name: "太字" }).click();
    await page.keyboard.press("ArrowLeft");

    const focused = page.locator(":focus");
    await expect(focused).not.toHaveAttribute("aria-label", "元に戻す");
    await expect(focused).not.toHaveAttribute("aria-label", "やり直す");
    await expect(focused).toHaveAttribute("aria-label", "全画面表示にする");
  });

  test("Home/End で先頭/末尾の有効なボタンに移動する", async ({ page }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // 「下線」は toolbar 中盤の単純トグルボタン（クリックしてもダイアログ等
    // 他要素にフォーカスを奪われない）。ここを起点に Home/End を検証する。
    await toolbar.getByRole("button", { name: "下線" }).click();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "下線");

    await page.keyboard.press("Home");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "太字");

    await page.keyboard.press("End");
    await expect(page.locator(":focus")).toHaveAttribute(
      "aria-label",
      "全画面表示にする",
    );
  });

  test("axe スキャンで critical/serious 違反がない", async ({ page }) => {
    await page.goto(NEW_POST_PATH);
    await expect(page.getByRole("main")).toBeVisible();

    // Lexical の contenteditable は ContentEditable に aria-label 付与済み
    // （#1340）のため除外しない。axe-admin-pages.spec.ts と同じ方針
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    expect(
      blocking,
      blocking
        .map(
          (v) =>
            `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.helpUrl}`,
        )
        .join("\n\n"),
    ).toEqual([]);
  });
});
