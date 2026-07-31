import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { Result } from "axe-core";
import { urls } from "../../fixtures";

const ADMIN_AXE_ROUTES = [
  { path: urls.adminDashboard, label: "ダッシュボード" },
  { path: urls.adminNotifications, label: "通知" },
  { path: urls.adminReservations, label: "予約管理" },
  { path: urls.adminCustomers, label: "顧客管理" },
  { path: urls.adminInquiries, label: "お問い合わせ管理" },
  { path: urls.adminSpaces, label: "スペース管理" },
  { path: urls.adminSpaceLocations, label: "スペース管理 場所タブ" },
  { path: urls.adminSpaceCategories, label: "スペース管理 カテゴリータブ" },
  { path: urls.adminSpaceReviews, label: "スペース管理 レビュータブ" },
  { path: urls.adminEvents, label: "イベント管理" },
  { path: urls.adminCoupons, label: "クーポン管理" },
  { path: urls.adminPages, label: "ページ管理" },
  { path: urls.adminPosts, label: "投稿管理" },
  { path: urls.adminNews, label: "お知らせ管理" },
  { path: urls.adminFaq, label: "FAQ 管理" },
  { path: urls.adminMedia, label: "メディア管理" },
  { path: urls.adminTerms, label: "利用規約管理" },
  { path: urls.adminTermsTrash, label: "規約ゴミ箱" },
  { path: urls.adminTermsAgreements, label: "規約同意記録" },
  { path: urls.adminStaff, label: "スタッフ管理" },
  { path: urls.adminAuditLogs, label: "監査ログ" },
  { path: urls.adminSettings, label: "設定" },
] as const;

/**
 * 管理画面 - axe-core 自動アクセシビリティスキャン（管理者認証済み state）
 *
 * 管理画面も業務ツールとして繰り返し使う画面のため、公開ページ / customer
 * マイページと同じく serious / critical 違反を blocking とする。
 *
 * 【設計原則】
 * - WCAG 2.1 Level A/AA タグで filter
 * - Lexical editor（contenteditable）は除外しない。ContentEditable に
 *   aria-label または aria-labelledby でアクセシブルネームを付与済みのため
 *   通常スキャン対象に含める
 * - `serious` / `critical` を blocking
 *
 * 前提: chromium-admin project で実行（setup-admin が storage state 作成済み）
 */

/**
 * 管理画面用の AxeBuilder 共通設定
 * - Recharts / FullCalendar 等、axe が誤検知する動的ウィジェットのみ exclude
 *   （2026-07-21 時点で実測確認済み。新たに exclude を追加する場合は
 *   exclude を外した状態で実際に axe を走らせ、違反内容を確認してから追加すること）
 */
function buildAdminAxeScanner(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('[class*="recharts" i]') // Recharts SVG
    .exclude('[class*="fc-" i]'); // FullCalendar (if any)
}

/**
 * 違反を人間可読な文字列に整形（assertion message 用）
 */
function formatViolations(violations: readonly Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.helpUrl}`,
    )
    .join("\n\n");
}

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

/**
 * axe が WAI-ARIA APG の toolbar pattern を評価できないことによる既知の誤検知。
 *
 * `scrollable-region-focusable` は「スクロール領域の子孫に tabindex>=0 が無い」ことを
 * serious として報告する。Radix の RovingFocusGroup はフォーカス進入前の item を
 * すべて tabindex=-1 に保ち、単一の tab stop は親の `Toolbar.Root` 側にあるため、
 * axe からは常に「focusable content 無し」に見える。
 *
 * 実際には Tab で Root に入り矢印キーで item 間を移動でき、その過程でこの領域は
 * スクロールする。この操作性は `lexical-toolbar-roving-tabindex.spec.ts` が
 * (a) 単一 tab stop (b) Arrow/Home/End 移動 (c) disabled のスキップ まで実測している。
 *
 * item を tabindex=0 にすると toolbar 内に複数の tab stop ができ APG に反するため、
 * 実装を曲げずにこのノードだけを除外する。**ルール自体は無効化しない**
 * （他のスクロール領域の違反は引き続き blocking）。
 */
function isRovingToolbarScrollRegion(violation: Result): boolean {
  if (violation.id !== "scrollable-region-focusable") return false;
  return violation.nodes.every((node) =>
    node.html.includes('data-slot="lexical-toolbar-scroll"'),
  );
}

function isBlocking(violation: Result): boolean {
  if (isRovingToolbarScrollRegion(violation)) return false;
  return violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false;
}

test.describe("a11y scan - 管理画面主要ページ", () => {
  for (const route of ADMIN_AXE_ROUTES) {
    test(`${route.label}ページに critical/serious 違反がない`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await expect(page.getByRole("main")).toBeVisible();

      const results = await buildAdminAxeScanner(page).analyze();
      const blocking = results.violations.filter(isBlocking);

      expect(
        blocking,
        `Admin ${route.label} a11y violations:\n${formatViolations(results.violations)}`,
      ).toEqual([]);
    });
  }

  test("投稿新規作成ページ（空エディタ）に critical/serious 違反がない", async ({
    page,
  }) => {
    await page.goto(`${urls.adminPosts}/new`);
    await expect(page.getByRole("main")).toBeVisible();

    const results = await buildAdminAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Admin post new page a11y violations:\n${formatViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("投稿新規作成ページ（本文入力後）に critical/serious 違反がない", async ({
    page,
  }) => {
    await page.goto(`${urls.adminPosts}/new`);

    const editor = page
      .getByRole("region", { name: "本文エディタ" })
      .getByRole("textbox");
    await expect(editor).toBeVisible({ timeout: 15000 });
    await editor.click();
    await page.keyboard.type("E2E a11y スキャン用の本文です。");

    const results = await buildAdminAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Admin post new page (dirty) a11y violations:\n${formatViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("スペース編集ページの説明エディタが視認ラベルと一致するアクセシブルネームを持つ（PR#1348 Codexレビュー指摘の回帰確認）", async ({
    page,
  }) => {
    // spSearch（SpaceFilters.tsx の nuqs クエリキー）で直接絞り込む。既定の
    // 「作成日（新しい順）」ソート + ページネーション任せだと、他の並行 E2E/
    // integration テストが同じ test DB に書き込む spaces に押し出されて
    // 対象行が 1 ページ目に出ないことがある（本テストの本題である
    // アクセシブルネーム検証とは無関係な flake のため、検索絞り込みで回避する）。
    await page.goto(
      `${urls.adminSpaces}?spSearch=${encodeURIComponent("コワーキングスペース")}`,
    );

    await page
      .getByRole("link", { name: "コワーキングスペース", exact: true })
      .click();

    await expect(page).toHaveURL(/\/admin\/spaces\/[^/]+\/edit$/u, {
      timeout: 20000,
    });

    // SpaceEditForm.tsx の <Label id="space-description-label" htmlFor="space-description">
    // と LazyLexicalEditor の ariaLabelledBy="space-description-label" による
    // aria-labelledby 関連付けで、contenteditable のアクセシブルネームが視認ラベルの
    // テキストと一致することを確認する。Lexical の ContentEditable は
    // <div contenteditable> を描画するため labelable element ではなく、
    // <label htmlFor> だけではネイティブ label-for 関連付けが成立しない
    // （PR#1348 の初版はこの点を見落としており、本テストは修正前は失敗していた）。
    // axe は id/aria-labelledby の不在を検知できないため、getByRole の name
    // 解決で明示的に検証する。
    const descriptionEditor = page.getByRole("textbox", { name: "説明 *" });
    await expect(descriptionEditor).toBeVisible({ timeout: 15000 });

    const results = await buildAdminAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Admin space edit page a11y violations:\n${formatViolations(results.violations)}`,
    ).toEqual([]);
  });
});
