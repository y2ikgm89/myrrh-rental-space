import type { Page } from "@playwright/test";

/**
 * CSP 違反をコンソールから収集する。
 *
 * **`msg.type()` で絞らないこと。** Chrome は CSP 違反を必ずしも `error` として
 * 出さず、inline style のブロックは `INFO:CONSOLE` レベルで出る
 * （CI run 30606269265 の browser log で実測）。旧実装は `type === "error"` で
 * 絞っていたため、/contact・/events・/admin/reservations で起きていた
 * `style-src-attr` / `style-src` の違反を 1 件も検出できていなかった。
 *
 * 収集開始は `page.goto` より前に行う（module 評価時に `<style>` を注入する
 * ライブラリ = sonner の違反は最初のロードで出る）。
 */
export function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Content Security Policy")) {
      violations.push(text);
    }
  });
  return violations;
}

/** 失敗時に原因が分かるよう、違反文を改行区切りで返す。 */
export function formatCspViolations(violations: readonly string[]): string {
  return violations.length === 0
    ? "(none)"
    : `\n  - ${violations.join("\n  - ")}`;
}
