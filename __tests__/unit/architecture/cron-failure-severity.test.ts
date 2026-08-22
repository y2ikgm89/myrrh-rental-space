/**
 * cron route は「ジョブ全体の失敗」を HIGH 以上で記録する。
 *
 * ## なぜ
 *
 * 監査 A-07: 8 本の cron が top-level catch で `ErrorSeverity.MEDIUM` を出したまま
 * HTTP 500 を返していた（news-scheduled-publish / blog-scheduled-publish /
 * blog-trash-cleanup / faq-trash-cleanup / faq-stale-check / notification-cleanup /
 * customer-duplicate-scan / customer-risk-scan）。
 *
 * MEDIUM は `logger-core.ts` の `SEVERITY_TO_GCP` で `WARNING` に落ち、
 * `@type = ReportedErrorEvent` マーカーが付くのは ERROR / CRITICAL のときだけ。
 * よって `terraform/monitoring.tf` の `reported_error_events` メトリクス
 * （filter が `jsonPayload."@type"=...ReportedErrorEvent`）に**一件も入らない**。
 * severity も CRITICAL ではないので `severity_critical` にも入らない。
 * ジョブが毎回落ちても、ログに WARNING が残るだけで誰にも届かない。
 *
 * 残り 15 本は元から HIGH / CRITICAL を持っていたので、これは一貫性の欠落だった。
 *
 * ## 何を見るか
 *
 * `src/app/api/cron/*​/route.ts` の各ファイルが `ErrorSeverity.HIGH` か
 * `ErrorSeverity.CRITICAL` を**実コード行で**少なくとも 1 回使っていること。
 *
 * **MEDIUM を禁止しない。** ループ内の 1 件失敗（calendar-sync / event-import /
 * smart-lock-cleanup / waitlist-expire）は処理を止めずに次へ進む設計で、
 * MEDIUM が正しい。ここが守るのは「そのファイルに HIGH 以上が 1 つも無い」形 —
 * 実際に起きた欠陥の形そのもの。
 *
 * **粗い**: どの catch が top-level かまでは見ない。静的走査で catch の入れ子を
 * 判定するのは脆く、この gate が防ぎたい欠陥（HIGH が 1 つも無い）には不要。
 *
 * ## 直し方
 *
 * ジョブ全体が失敗して 500 を返す catch の `severity` を
 * `ErrorSeverity.HIGH` にする。1 件だけ失敗して継続する箇所は MEDIUM のままでよい。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CRON_ROOT = join(process.cwd(), "src", "app", "api", "cron");

/** コメント行を除いた実コード行だけを返す。 */
function codeLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !line.startsWith("*") &&
        !line.startsWith("//") &&
        !line.startsWith("/*"),
    );
}

/** ジョブ全体の失敗として扱える severity を実コード行で使っているか。 */
function hasJobLevelSeverity(source: string): boolean {
  return codeLines(source).some(
    (line) =>
      line.includes("ErrorSeverity.HIGH") ||
      line.includes("ErrorSeverity.CRITICAL"),
  );
}

function cronRouteFiles(): string[] {
  return readdirSync(CRON_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(CRON_ROOT, entry.name, "route.ts"))
    .filter((file) => existsSync(file));
}

describe("cron の失敗は監視に届く severity で記録する", () => {
  const files = cronRouteFiles();

  test("走査が空振りしていない（cron route が実在する）", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("各 cron route が HIGH 以上を少なくとも 1 つ持つ", () => {
    const missing = files
      .filter((file) => !hasJobLevelSeverity(readFileSync(file, "utf8")))
      .map((file) => file.split(/[\\/]/u).slice(-2).join("/"));

    expect(missing).toEqual([]);
  });

  test("判定はコメントと実コードを区別し、MEDIUM だけの形を落とす（見本）", () => {
    // 落ちるべき形: MEDIUM しか無い
    const mediumOnly = `logError(error, {
  severity: ErrorSeverity.MEDIUM,
});
return jsonError("failed", 500);`;
    expect(hasJobLevelSeverity(mediumOnly)).toBe(false);

    // 落ちてはいけない形: ループ内 MEDIUM + top-level HIGH の併用
    const mixed = `for (const item of items) {
  logError(error, { severity: ErrorSeverity.MEDIUM });
}
logError(error, { severity: ErrorSeverity.HIGH });`;
    expect(hasJobLevelSeverity(mixed)).toBe(true);

    // コメントでの言及だけでは満たさない
    const commentOnly = `/**
 * ここは ErrorSeverity.HIGH にしない。
 */
logError(error, { severity: ErrorSeverity.MEDIUM });`;
    expect(hasJobLevelSeverity(commentOnly)).toBe(false);
  });
});
