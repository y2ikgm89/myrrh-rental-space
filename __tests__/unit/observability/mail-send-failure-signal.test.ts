/**
 * **メール送信の最終失敗ログは、log metric の filter に実際に当たる文言でなければならない。**
 *
 * ## なぜ
 *
 * 監査 A-08: `sendEmail` の最終失敗は MEDIUM で記録される（呼び出し側が
 * 「メール無しで先へ進めるか」を判断する設計）。MEDIUM は `logger-core.ts` の
 * `SEVERITY_TO_GCP` で WARNING に落ち、`@type = ReportedErrorEvent` が付かないので
 * `reported_error_events` にも `severity_critical` にも乗らない。
 * 唯一の信号が `mail_send_failure` log metric で、filter が emit site とずれると
 * **alert は発火しようがない**。
 *
 * 以前は `new Error(error.message)`（Resend 由来の可変文言）を記録していたため、
 * 文言で拾う filter は原理的に書けなかった。固定文言へ寄せたうえで、この gate が
 * emit site と `terraform/monitoring.tf` の両方から読んで突き合わせる
 * （`google-calendar-sync-failure-signal.test.ts` と同型）。
 *
 * ## 何を見るか
 *
 * `src/shared/lib/email/send.ts` の固定文言定数が、
 * `google_logging_metric.mail_send_failure` の filter に含まれること。
 * その定数が実際に全ての最終失敗 emit site で使われていること。
 *
 * **operation は突合しない。** `sendEmail` の `operation` は呼び出し側から渡される
 * 変数（予約確認・領収書・問い合わせ返信…）で、単一のリテラルにならない。
 * filter 側も message と category だけで拾う。
 *
 * ## 直し方
 *
 * 文言を変えるなら `terraform/monitoring.tf` の filter も同じ commit で変える。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const SEND_PATH = join(ROOT, "src", "shared", "lib", "email", "send.ts");
const METRIC_PATH = join(ROOT, "terraform", "monitoring.tf");

/** `send.ts` が持つ固定文言。 */
function readFailureMessage(source: string): string {
  const message = /const MAIL_SEND_FAILED_MESSAGE = "([^"]+)";/u.exec(
    source,
  )?.[1];
  if (!message) {
    throw new Error("MAIL_SEND_FAILED_MESSAGE が send.ts から読めない");
  }
  return message;
}

/** 最終失敗の emit site 数（`{ ok: false, reason: "error" }` を返す 3 経路）。 */
function countFailureEmits(source: string): number {
  return [
    ...source.matchAll(/logError\(new Error\(MAIL_SEND_FAILED_MESSAGE\)/gu),
  ].length;
}

function readMetricFilter(metricHcl: string): string {
  return (
    /resource\s+"google_logging_metric"\s+"mail_send_failure"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? ""
  );
}

describe("メール送信失敗の signal は log metric の filter に一致する", () => {
  test("send.ts の固定文言が metric filter に含まれる", () => {
    const message = readFailureMessage(readFileSync(SEND_PATH, "utf8"));
    const filter = readMetricFilter(readFileSync(METRIC_PATH, "utf8"));

    expect(filter.length).toBeGreaterThan(0);
    expect({
      message,
      filterHasMessage: filter.includes(`jsonPayload.message:"${message}"`),
      filterHasCategory: filter.includes('jsonPayload.category="EXTERNAL_API"'),
    }).toEqual({
      message,
      filterHasMessage: true,
      filterHasCategory: true,
    });
  });

  test("最終失敗の 3 経路すべてが固定文言を使う", () => {
    // payload 生成失敗 / provider エラー / 例外 の 3 つ。
    // 1 つでも可変文言に戻ると、その経路だけ metric から漏れる。
    expect(countFailureEmits(readFileSync(SEND_PATH, "utf8"))).toBe(3);
  });

  test("突合ロジックが差分を検出する（見本）", () => {
    const filter =
      'jsonPayload.category="EXTERNAL_API"\njsonPayload.message:"Mail send failed"';

    // 落ちてはいけない形
    expect(filter.includes('jsonPayload.message:"Mail send failed"')).toBe(
      true,
    );

    // 落ちるべき形: 文言を変えたのに filter が古いまま
    expect(filter.includes('jsonPayload.message:"Mail delivery failed"')).toBe(
      false,
    );
  });
});
