import AxeBuilder from "@axe-core/playwright";
import type { Page } from "../fixtures/e2e-test";
import type { Result } from "axe-core";

/**
 * 管理画面 axe スキャンの共有設定（scanner / blocking 判定 / 整形）。
 *
 * 管理画面の axe 検証は `axe-admin-pages.spec.ts` だけでなく
 * `lexical-toolbar-roving-tabindex.spec.ts` からも走る。判定ロジックを spec ごとに
 * 複製すると、片方に入れた例外がもう片方に効かず同じノードで落ち続けるため、
 * ここを SSoT にする。
 */

/**
 * 管理画面用の AxeBuilder 共通設定
 * - Recharts / FullCalendar 等、axe が誤検知する動的ウィジェットのみ exclude
 *   （2026-07-21 時点で実測確認済み。新たに exclude を追加する場合は
 *   exclude を外した状態で実際に axe を走らせ、違反内容を確認してから追加すること）
 */
export function buildAdminAxeScanner(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('[class*="recharts" i]') // Recharts SVG
    .exclude('[class*="fc-" i]'); // FullCalendar (if any)
}

/**
 * 違反を人間可読な文字列に整形（assertion message 用）
 */
export function formatAxeViolations(violations: readonly Result[]): string {
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

/** 管理画面 axe スキャンの blocking 判定（serious / critical、既知の誤検知を除く）。 */
export function isBlockingAdminViolation(violation: Result): boolean {
  if (isRovingToolbarScrollRegion(violation)) return false;
  return violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false;
}
