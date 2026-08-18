/**
 * **GCal webhook の sync_failed ログは、log metric の filter に実際に当たる文言でなければならない。**
 *
 * ## なぜ
 *
 * `/api/webhooks/google-calendar` は検証済み通知を 200 ack する（Google の
 * 再送嵐を防ぐ意図的な設計）。同期失敗は HTTP では見えず、MEDIUM の
 * `Webhook sync failed` ログだけが信号になる。HIGH にはならないので
 * `reported_error_events` にも乗らない。
 *
 * filter が emit site とずれると、`google_calendar_sync_failure` alert は
 * **発火しようがない**。文字列を test 側に書き写すと、この gate 自身が
 * 次の drift の発生源になる。route と `terraform/monitoring.tf` の両方から
 * 読んで突き合わせる。
 *
 * ## 何を見るか
 *
 * route の `!result.success` 分岐が使う message / operation が、
 * `google_logging_metric.google_calendar_sync_failure` の filter に含まれること。
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
  "webhooks",
  "google-calendar",
  "route.ts",
);
const METRIC_PATH = join(ROOT, "terraform", "monitoring.tf");

function readSyncFailedEmit(routeSource: string): {
  message: string;
  operation: string;
} {
  const block =
    /if\s*\(!result\.success\)\s*\{([\s\S]*?)return acknowledgeNotification\(\{\s*processing:\s*"sync_failed"\s*\}\)/u.exec(
      routeSource,
    )?.[1];
  if (!block) {
    throw new Error("Webhook sync_failed emit site が route から読めない");
  }
  const message = /new Error\("([^"]+)"\)/u.exec(block)?.[1];
  const operation = /operation:\s*"([^"]+)"/u.exec(block)?.[1];
  if (!message || !operation) {
    throw new Error("sync_failed の message / operation が route から読めない");
  }
  return { message, operation };
}

function readMetricFilter(metricHcl: string): string {
  return (
    /resource\s+"google_logging_metric"\s+"google_calendar_sync_failure"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? ""
  );
}

describe("GCal webhook sync_failed の signal は log metric の filter に一致する", () => {
  test("route の emit site と metric filter が同じ message / operation を指す", () => {
    const emit = readSyncFailedEmit(readFileSync(ROUTE_PATH, "utf8"));
    const filter = readMetricFilter(readFileSync(METRIC_PATH, "utf8"));

    expect(filter.length).toBeGreaterThan(0);
    expect({
      message: emit.message,
      operation: emit.operation,
      filterHasMessage: filter.includes(
        `jsonPayload.message:"${emit.message}"`,
      ),
      filterHasOperation: filter.includes(
        `jsonPayload.context.operation="${emit.operation}"`,
      ),
    }).toEqual({
      message: emit.message,
      operation: emit.operation,
      filterHasMessage: true,
      filterHasOperation: true,
    });
  });
});
