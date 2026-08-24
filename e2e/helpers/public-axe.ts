import AxeBuilder from "@axe-core/playwright";
import type { Page } from "../fixtures/e2e-test";
import type { Result } from "axe-core";

/**
 * 公開面 axe スキャンの共有設定（scanner / blocking 判定 / 整形）。
 *
 * 管理画面側（`admin-axe.ts`）と同じ理由でここを SSoT にする。判定と除外を
 * spec ごとに複製すると、片方に入れた例外がもう片方に効かず同じノードで落ち続ける。
 *
 * 公開面の axe spec は 2 本ある:
 *
 * - `axe-public-pages.spec.ts` — URL で到達できるページ（一覧・詳細・フォーム）
 * - `axe-reservation-wizard.spec.ts` — 操作しないと到達できない予約ウィザードの
 *   step 2 / step 3
 */

/**
 * 公開ページ用の AxeBuilder 共通設定。
 *
 * サードパーティの埋め込み（Google Maps / YouTube / Instagram）は我々の責任範囲外
 * なので除外する。**Turnstile は除外しない** — E2E では `api.js` をローカル実装へ
 * 差し替えており（`e2e/fixtures/turnstile-stub.ts`）、この origin の iframe は
 * 1 つも生成されない。
 */
export function buildPublicAxeScanner(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('iframe[src*="google.com/maps"]')
    .exclude('iframe[src*="youtube.com"]')
    .exclude('iframe[src*="instagram.com"]')
    .exclude('[class*="google-maps" i]');
}

/** 違反を人間可読な文字列に整形（assertion message 用）。 */
export function formatAxeViolations(violations: readonly Result[]): string {
  return violations
    .map(
      (violation) =>
        `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))\n  ${violation.helpUrl}\n  ${violation.nodes.map((node) => node.target.join(" > ")).join(", ")}`,
    )
    .join("\n\n");
}

/**
 * blocking とする impact。
 *
 * `minor` / `moderate` は best-practice 寄りで、公開面では意匠との折衷が必要な
 * ものが混ざるため落とさない。`serious` / `critical` はゼロ許容。
 */
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

export function isBlockingPublicViolation(violation: Result): boolean {
  return violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false;
}
