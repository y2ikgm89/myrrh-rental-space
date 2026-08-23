/**
 * **DB 到達性プローブの失敗ログは、log metric の filter に実際に当たる文言でなければならない。**
 *
 * ## なぜ
 *
 * 監査 A-29: `docs/observability/slo.md` は「admin の DB 到達性は `/api/health` の
 * any-1 5xx alert で見る」と書いていたが、**`/api/health` を叩く主体がリポジトリ内に
 * 存在しなかった**。Cloud Run probe は `/api/live`、外形監視は公開面だけ、
 * uptime check は 0 件、public surface の `/api/health` は 404。
 * つまり `health_probe_5xx` は「人が手で開いた瞬間」にしか評価されず、
 * DB が落ちても沈黙する。
 *
 * 代わりに `/api/cron/db-health` が 10 分ごとに `SELECT 1` を打つ。この route の
 * 失敗ログだけが唯一の定期信号なので、**emit site の文言と metric の filter が
 * ずれた瞬間に alert は発火しようがなくなる**。書いた本人以外はずれに気づけない。
 *
 * ## 何を見るか
 *
 * `src/app/api/cron/db-health/route.ts` の先頭固定部の定数が、
 * `google_logging_metric.db_health_probe_failure` の filter に前方一致として
 * 含まれること。category も両側で一致すること。
 * （`mail-send-failure-signal.test.ts` / `google-calendar-sync-failure-signal.test.ts` と同型）
 *
 * cron path が Cloud Scheduler に登録されていることは
 * `cron-scheduler-path-sync.test.ts` が別途固定している。ここでは重複して見ない。
 *
 * ## 直し方
 *
 * 文言を変えるなら `terraform/monitoring.tf` の filter も同じ commit で変える。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const ROUTE_PATH = join(
  ROOT,
  "src",
  "app",
  "api",
  "cron",
  "db-health",
  "route.ts",
);
const METRIC_PATH = join(ROOT, "terraform", "monitoring.tf");
const SCHEDULER_PATH = join(ROOT, "terraform", "cloud_scheduler.tf");

/** route が持つ先頭固定部。 */
function readFailureMessagePrefix(source: string): string {
  const message = /const DB_HEALTH_PROBE_FAILED_MESSAGE = "([^"]+)";/u.exec(
    source,
  )?.[1];
  if (!message) {
    throw new Error("DB_HEALTH_PROBE_FAILED_MESSAGE が route.ts から読めない");
  }
  return message;
}

function readMetricFilter(metricHcl: string): string {
  return (
    /resource\s+"google_logging_metric"\s+"db_health_probe_failure"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? ""
  );
}

describe("DB 到達性プローブの signal は log metric の filter に一致する", () => {
  test("route の先頭固定部が metric filter の前方一致に含まれる", () => {
    const message = readFailureMessagePrefix(readFileSync(ROUTE_PATH, "utf8"));
    const filter = readMetricFilter(readFileSync(METRIC_PATH, "utf8"));

    expect(filter.length).toBeGreaterThan(0);
    expect({
      message,
      filterHasMessage: filter.includes(`jsonPayload.message=~"^${message}"`),
      filterHasCategory: filter.includes('jsonPayload.category="DATABASE"'),
    }).toEqual({
      message,
      filterHasMessage: true,
      filterHasCategory: true,
    });
  });

  test("emit site が前方固定の形を保っている", () => {
    const source = readFileSync(ROUTE_PATH, "utf8");

    // 可変部分（driver 由来のメッセージ）は後ろに連結する。素の `new Error(cause)`
    // へ戻すと文言で拾う filter は原理的に書けなくなる。
    expect(source).toContain(
      "new Error(`${DB_HEALTH_PROBE_FAILED_MESSAGE}: ${cause}`)",
    );
    expect(source).toContain("category: ErrorCategory.DATABASE");
  });

  test("alert 閾値が Cloud Scheduler の retry 回数と整合している", () => {
    // 閾値の導出そのもの: 初回 + retry_count でリトライを使い切った本物の停止だけが
    // 閾値に届く。retry_count を減らすと「使い切っても page しない」形になる。
    const scheduler = readFileSync(SCHEDULER_PATH, "utf8");
    // `retry_config` block の中を見る。ファイル先頭から素で
    // `retry_count` を探すと、先に見つかるのは **この値を説明するコメント**で、
    // 実設定を下げても緑になる（実測で見つけた）。
    const retryCount = /retry_config\s*\{[\s\S]*?retry_count\s*=\s*(\d+)/u.exec(
      scheduler,
    )?.[1];
    const threshold =
      /resource\s+"google_monitoring_alert_policy"\s+"db_health_probe_failure"[\s\S]*?threshold_value\s*=\s*(\d+)/u.exec(
        readFileSync(METRIC_PATH, "utf8"),
      )?.[1];

    expect({ retryCount, threshold }).toEqual({
      retryCount: "3",
      threshold: "3",
    });
  });

  test("突合ロジックが差分を検出する（見本）", () => {
    const filter =
      'jsonPayload.category="DATABASE"\njsonPayload.message=~"^Database health probe failed"';

    // 落ちてはいけない形
    expect(
      filter.includes('jsonPayload.message=~"^Database health probe failed"'),
    ).toBe(true);

    // 落ちるべき形: 文言を変えたのに filter が古いまま
    expect(filter.includes('jsonPayload.message=~"^DB probe failed"')).toBe(
      false,
    );

    // 前方一致なので、driver のメッセージが後ろに付いても filter は当たる
    expect(
      "Database health probe failed: Can't reach database server".startsWith(
        "Database health probe failed",
      ),
    ).toBe(true);
  });
});
