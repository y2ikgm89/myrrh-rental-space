/**
 * 「黙って劣化する」経路は `logError(..., HIGH)` を通る（監査 A-28）。
 *
 * ## なぜ
 *
 * `logger-core.ts` には 2 系統の API があり、観測結果が違う:
 *
 * - `logError` は HIGH / CRITICAL で `@type = ReportedErrorEvent` を付ける
 * - 汎用 `logger.error` / `logger.warn` は **`@type` を一切付けない**
 *
 * つまり `logger.error` は 5 つの log metric のどれにも一致しない
 * （`reported_error_events` はマーカー不一致、`severity_critical` は severity 不一致）。
 * ローカルではどちらも赤いログ行に見えるので、レビューでは区別が付かない。
 *
 * 実害が出ていた 3 経路:
 *
 * - `sitemap.ts`: DB 不調で全 URL が消えた sitemap を **HTTP 200 で返す**。
 *   レスポンスにも SLO にも出ないので、検知経路はログだけだった
 * - `sitemap/queries.ts`: collection 単位の部分失敗も同じ
 * - `cloudflare.ts`: purge の恒常失敗。エッジは s-maxage=3600 +
 *   stale-while-revalidate=3600 で古い内容を返し続け、管理者は「管理画面では直っているのに
 *   公開面が変わらない」状態に置かれる
 *
 * ## 何を見るか
 *
 * 上記ファイルの失敗経路が `logError` + `ErrorSeverity.HIGH` を持つこと。
 * **`logger` の使用自体は禁じない** — `logger.info` の観測ログや
 * `logger.debug` は残っていてよい。見るのは失敗経路の API 選択だけ。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

const SITES = [
  {
    file: join(ROOT, "src", "app", "sitemap.ts"),
    label: "sitemap 全滅",
    marker: "catastrophic failure",
  },
  {
    file: join(ROOT, "src", "shared", "domain", "sitemap", "queries.ts"),
    label: "sitemap 部分失敗",
    marker: "getSitemapContentData",
  },
  {
    file: join(ROOT, "src", "shared", "lib", "cloudflare.ts"),
    label: "Cloudflare purge 失敗",
    marker: "Cloudflare cache purge failed",
  },
] as const;

/**
 * 失敗文言の周辺（前後 600 字）で HIGH の logError を使っているか。
 *
 * marker はファイル内に複数回現れうる（関数定義と呼出など）ので、
 * **先頭の 1 件だけを見ない**。どこか 1 箇所で成立していれば良い。
 */
export function reportsFailureAsHigh(source: string, marker: string): boolean {
  let index = source.indexOf(marker);
  while (index !== -1) {
    const window = source.slice(
      Math.max(0, index - 600),
      Math.min(source.length, index + 600),
    );
    if (window.includes("logError(") && window.includes("ErrorSeverity.HIGH")) {
      return true;
    }
    index = source.indexOf(marker, index + marker.length);
  }
  return false;
}

describe("黙って劣化する経路は Error Reporting に載る", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(SITES.length).toBeGreaterThan(2);
    for (const site of SITES) {
      const source = readFileSync(site.file, "utf8");
      expect({
        label: site.label,
        hasMarker: source.includes(site.marker),
      }).toEqual({ label: site.label, hasMarker: true });
    }
  });

  test("落ちるべき書き方: logger.error / logger.warn で済ませる", () => {
    expect(
      reportsFailureAsHigh(
        'logger.error("sitemap() catastrophic failure", { error });',
        "catastrophic failure",
      ),
    ).toBe(false);
    expect(
      reportsFailureAsHigh(
        'logger.warn("Cloudflare cache purge failed", { error });',
        "Cloudflare cache purge failed",
      ),
    ).toBe(false);
  });

  test("落ちてはいけない書き方: logError + HIGH", () => {
    expect(
      reportsFailureAsHigh(
        'logError(error, { severity: ErrorSeverity.HIGH, context: { detail: "catastrophic failure" } });',
        "catastrophic failure",
      ),
    ).toBe(true);
  });

  test("MEDIUM への降格は通さない（WARNING になり @type が付かない）", () => {
    expect(
      reportsFailureAsHigh(
        'logError(error, { severity: ErrorSeverity.MEDIUM, context: { detail: "catastrophic failure" } });',
        "catastrophic failure",
      ),
    ).toBe(false);
  });

  test("実ファイルの 3 経路がすべて HIGH で報告している", () => {
    const offenders = SITES.filter(
      (site) =>
        !reportsFailureAsHigh(readFileSync(site.file, "utf8"), site.marker),
    ).map((site) => site.label);

    expect(offenders).toEqual([]);
  });
});
