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
 *   (f) フォントサイズ入力（自由入力 text input）も含めて toolbar 全体が
 *       実際の Tab / Shift+Tab キー操作で単一ストップであること、
 *       ArrowRight/ArrowLeft で当該 input にも出入りできること、
 *       input 内でのキャレット移動（テキスト境界にいない限り）が
 *       ロービング移動に奪われないこと（PR#1342 フォローアップ,
 *       Codexレビュー指摘スレッド PRRT_kwDOQ0jEts6SfWgO）
 *
 * 設計:
 *   - (a)〜(e) は実ページ内の無関係なヘッダー/ナビの Tab 順に依存すると
 *     周辺 UI 変更で壊れるため、toolbar コンテナ自体に `.focus()` する。
 *     Radix RovingFocusGroup はコンテナへの entry focus を検知すると
 *     同期的に最初の focusable item へ redirect するため、これは実際の
 *     Tab キー到達（コンテナ tabIndex=0 → 即座に子ボタンへ redirect）と
 *     同じ内部ロジックを exercise する
 *   - (f) は上記 (a) の `.focus()` 経由の検証だけでは
 *     「toolbar 内に配置されているが roving 対象外の独立 Tab ストップ」
 *     を見逃すという Codex レビュー指摘を受け、`page.keyboard.press("Tab")` /
 *     `"Shift+Tab"` による実際のキー操作で toolbar 全体を辿るテストを追加した
 *   - 新規投稿ページは編集履歴が無いため「元に戻す」「やり直す」が初期状態で
 *     disabled。これを (c) の固定 fixture として利用する
 *   - 「全画面表示にする」ボタンは ToolbarPlugin の DOM 順で常に最後の
 *     roving item（InsertSection/LayoutToolbarSection の条件付き表示に
 *     依存しない）ため、末尾到達の固定 fixture として利用する
 *   - 「テキスト変換」ボタン（TextCasePlugin）は DOM 順でフォントサイズ入力の
 *     直前にある固定 fixture として (f) で利用する
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

  test("実際の Tab/Shift+Tab キー操作で toolbar 全体が単一ストップである（フォントサイズ input を含む）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // entry は `.focus()` で決定的に行い（上のテストで検証済みの redirect
    // ロジック）、ここから先は実際の Tab キー操作のみを行う
    await toolbar.focus();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "太字");

    // 実際の Tab キーを1回押すだけで toolbar 全体（フォントサイズ input を
    // 含む）を抜け、toolbar 内には一切フォーカスが残らないことを検証する。
    // これが「独立 Tab ストップ」問題（Codexレビュー指摘）の直接的な回帰テスト。
    // 遷移先はエディタ本文（contenteditable）で、Lexical 公式の
    // TabIndentationPlugin が Tab/Shift+Tab をリスト用に独自捕捉するため
    // （本 PR と無関係な既存挙動）、ここから Shift+Tab で toolbar へ戻る
    // 往復はテストしない
    await page.keyboard.press("Tab");
    await expect(toolbar.locator(":focus")).toHaveCount(0);
  });

  test("toolbar への再進入は記憶アイテムに着地する（フォントサイズ input には着地しない）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });

    // クリックで「斜体」を記憶アイテムに変更する。エディタ本文に一度も
    // フォーカスが渡っていない新規ページ状態でクリックする（フォーマット
    // コマンドの適用後にエディタへフォーカスを戻す既存挙動と干渉しない
    // ようにするため。この挙動は本 PR と無関係）
    await toolbar.getByRole("button", { name: "斜体" }).click();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "斜体");

    // Radix の entry-focus redirect（コンテナへの focus イベントで
    // `event.target === event.currentTarget` を検知し、同期的に
    // 記憶アイテムへ focus() する内部ロジック）は、実際の Tab 到達・
    // Shift+Tab 到達・`.focus()` のいずれでも同一コードパスを通るため、
    // ここでの再進入検証はフォントサイズ input が記憶アイテムを上書き
    // していないことを直接示す
    await toolbar.focus();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "斜体");
  });

  test("ArrowRight/ArrowLeft でフォントサイズ input にも出入りできる", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    const fontSizeInput = toolbar.getByRole("textbox", {
      name: "フォントサイズ",
    });

    // 「フォントサイズを小さく」/「フォントサイズを大きく」は DOM 順で
    // フォントサイズ input の直前・直後にある固定 fixture（単純なトグル
    // ボタンで、他 UI を開かず安全にクリックできる。「テキスト変換」は
    // DropdownMenuTrigger のためクリックするとメニューが開いてしまい、
    // この検証には使えない）。
    // 左右それぞれ独立に、隣接ボタンから ArrowRight/ArrowLeft 1回で
    // input に到達できることを確認する（input へ入った直後のキャレット
    // 位置はブラウザ依存のため、境界判定を伴う往復移動はここでは検証せず
    // 別テストの明示的な setSelectionRange 経由の検証に委ねる）
    const decrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを小さく",
    });
    await decrementButton.click();
    await expect(decrementButton).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(fontSizeInput).toBeFocused();

    const incrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを大きく",
    });
    await incrementButton.click();
    await expect(incrementButton).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(fontSizeInput).toBeFocused();
  });

  test("フォントサイズ input 内で ArrowLeft/ArrowRight はキャレット移動として機能する（ロービング移動に奪われない）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    const fontSizeInput = toolbar.getByRole("textbox", {
      name: "フォントサイズ",
    });

    await fontSizeInput.click();
    await fontSizeInput.fill("16");
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(1, 1),
    );

    // テキスト境界にいない ArrowLeft はキャレット移動のみで、フォーカスは
    // input に残ったまま selectionStart が変化する
    await page.keyboard.press("ArrowLeft");
    await expect(fontSizeInput).toBeFocused();
    await expect(
      fontSizeInput.evaluate((el: HTMLInputElement) => el.selectionStart),
    ).resolves.toBe(0);

    // テキスト先頭（selectionStart===0）での ArrowLeft は境界のため、
    // Radix のロービング移動に委譲し前のボタン（フォントサイズを小さく）
    // へ抜ける
    await page.keyboard.press("ArrowLeft");
    await expect(
      toolbar.getByRole("button", { name: "フォントサイズを小さく" }),
    ).toBeFocused();

    // 逆方向: 末尾からの ArrowRight は境界のためロービング移動に委譲する
    await page.keyboard.press("ArrowRight");
    await expect(fontSizeInput).toBeFocused();
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(2, 2),
    );
    await page.keyboard.press("ArrowRight");
    await expect(fontSizeInput).not.toBeFocused();
  });

  test("境界値超過の入力中に境界で矢印キーを押しても、blur で直後に disabled 化される増減ボタンへ委譲してフォーカスを失わない（PR#1351 フォローアップ, Codexレビュー指摘スレッド PRRT_kwDOQ0jEts6ShRqe）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    const fontSizeInput = toolbar.getByRole("textbox", {
      name: "フォントサイズ",
    });
    const incrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを大きく",
    });
    const decrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを小さく",
    });

    // MAX(72px) を超える値を末尾キャレットで入力する。この時点では
    // まだ blur していないため fontSize state（disabled 判定の基準）は
    // 古い値のまま。修正前はここで ArrowRight を押すと、Radix が
    // まだ enabled 判定の増加ボタンへ委譲し、委譲が引き起こす blur で
    // 値が 72 へ clamp・増加ボタンが直後に disabled 化され、
    // フォーカスが input にもボタンにも残らず失われていた
    await fontSizeInput.click();
    await fontSizeInput.fill("999");
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(3, 3),
    );

    await page.keyboard.press("ArrowRight");
    // フォーカスが失われていた場合（修正前）、この直後の Backspace は
    // どこにも届かず入力値は "999" のまま変化しない。フォーカスが
    // input に残っていることを、実際にキー入力が反映される（"99" に
    // なる）ことで検証する。`toBeFocused()` 単体の直後アサーションは
    // Radix が委譲する瞬間（フォーカス移動〜blur による disabled 化〜
    // フォーカス消失）を通過するまでの一瞬 true になり得るため
    // （web-first assertion は「一度でも真になった時点」で pass する）、
    // waitForTimeout に頼らずこの決定的な後続入力で検証する
    await page.keyboard.press("Backspace");
    await expect(fontSizeInput).toHaveValue("99");
    await expect(fontSizeInput).toBeFocused();

    // 確定して 72 へ clamp され、増加ボタンが正しく disabled になることを確認
    await fontSizeInput.fill("999");
    await page.keyboard.press("Enter");
    await expect(fontSizeInput).toHaveValue("72");
    await expect(incrementButton).toBeDisabled();

    // MIN(8px) 未満のケースも対称的に検証する（ArrowLeft × 減少ボタン）。
    // キャレットは先頭のため、後続の確認には Delete（前方削除）を使う
    await fontSizeInput.click();
    await fontSizeInput.fill("3");
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(0, 0),
    );

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Delete");
    await expect(fontSizeInput).toHaveValue("");
    await expect(fontSizeInput).toBeFocused();

    await fontSizeInput.fill("3");
    await page.keyboard.press("Enter");
    await expect(fontSizeInput).toHaveValue("8");
    await expect(decrementButton).toBeDisabled();
  });

  test("既に境界値で確定済み（定常的に disabled）の増減ボタンは、矢印キー1回でロービング対象として読み飛ばされフォーカスが input 内に閉じ込められない（PR#1355 再フォローアップ, Codexレビュー指摘スレッド PRRT_kwDOQ0jEts6Sin1U）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    const fontSizeInput = toolbar.getByRole("textbox", {
      name: "フォントサイズ",
    });
    const incrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを大きく",
    });
    const decrementButton = toolbar.getByRole("button", {
      name: "フォントサイズを小さく",
    });

    // まず 72(MAX) へ確定させ、増加ボタンを「このキー操作で新たに
    // disabled になる」のではなく「既に確定済みで定常的に disabled」の
    // 状態にする
    await fontSizeInput.click();
    await fontSizeInput.fill("72");
    await page.keyboard.press("Enter");
    await expect(fontSizeInput).toHaveValue("72");
    await expect(incrementButton).toBeDisabled();

    // 再度 input へフォーカスし末尾で ArrowRight。修正前は
    // `willAdjacentButtonBecomeDisabled` が遷移ケースと定常 disabled
    // ケースを区別せず常に preventDefault していたため、Radix への委譲
    // 自体が起きず、本来なら disabled な増加ボタンを自動的に読み飛ばして
    // 次の有効な項目へ抜けられるはずのロービング移動が機能せず
    // フォーカスが input 内に閉じ込められていた
    await fontSizeInput.click();
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(el.value.length, el.value.length),
    );
    await page.keyboard.press("ArrowRight");

    await expect(fontSizeInput).not.toBeFocused();
    // disabled 要素は HTML 仕様上フォーカスを保持できないため、
    // 増加ボタンではなく toolbar 内の別の有効なコントロールへ抜けている
    await expect(incrementButton).not.toBeFocused();
    await expect(toolbar.locator(":focus")).toBeVisible();

    // 対称: MIN(8) 側も検証
    await fontSizeInput.click();
    await fontSizeInput.fill("8");
    await page.keyboard.press("Enter");
    await expect(fontSizeInput).toHaveValue("8");
    await expect(decrementButton).toBeDisabled();

    await fontSizeInput.click();
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(0, 0),
    );
    await page.keyboard.press("ArrowLeft");

    await expect(fontSizeInput).not.toBeFocused();
    await expect(decrementButton).not.toBeFocused();
    await expect(toolbar.locator(":focus")).toBeVisible();
  });

  test("フォントサイズ input 内で Home/End は常にテキストフィールド内の移動として扱われる（ロービング移動に委譲しない）", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);
    const toolbar = page.getByRole("toolbar", { name: TOOLBAR_NAME });
    await expect(toolbar).toBeVisible({ timeout: 15000 });
    const fontSizeInput = toolbar.getByRole("textbox", {
      name: "フォントサイズ",
    });

    await fontSizeInput.click();
    await fontSizeInput.fill("16");
    await fontSizeInput.evaluate((el: HTMLInputElement) =>
      el.setSelectionRange(1, 1),
    );

    await page.keyboard.press("Home");
    await expect(fontSizeInput).toBeFocused();
    await expect(
      fontSizeInput.evaluate((el: HTMLInputElement) => el.selectionStart),
    ).resolves.toBe(0);

    await page.keyboard.press("End");
    await expect(fontSizeInput).toBeFocused();
    await expect(
      fontSizeInput.evaluate((el: HTMLInputElement) => el.selectionStart),
    ).resolves.toBe(2);
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
