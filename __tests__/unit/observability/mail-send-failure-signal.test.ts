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
 * 文言で拾う filter は原理的に書けなかった。**先頭固定 + 可変部分の連結**へ寄せ、
 * filter を前方一致（`=~"^..."`）にしたうえで、この gate が emit site と
 * `terraform/monitoring.tf` の両方から読んで突き合わせる
 * （`google-calendar-sync-failure-signal.test.ts` と同型）。
 *
 * **可変部分を message から追い出さない。** `send-fallback-guard.test.ts`（M11）が
 * 「送信元が未設定のときは remediation を audit log の message に残す」ことを
 * 固定している。`context` へ回すとその保証が消えるので、前方一致で両立させる。
 *
 * ## 何を見るか
 *
 * `src/shared/lib/email/send.ts` の先頭固定部の定数が、
 * `google_logging_metric.mail_send_failure` の filter に前方一致として含まれること。
 * 最終失敗の 3 経路すべてがその定数を前置する helper を通ること。
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

/** `send.ts` が持つ先頭固定部。 */
function readFailureMessagePrefix(source: string): string {
  const message = /const MAIL_SEND_FAILED_MESSAGE = "([^"]+)";/u.exec(
    source,
  )?.[1];
  if (!message) {
    throw new Error("MAIL_SEND_FAILED_MESSAGE が send.ts から読めない");
  }
  return message;
}

/**
 * 最終失敗の emit site 数（`{ ok: false, reason: "error" }` を返す 3 経路）。
 *
 * **`logError(new Error(...))` の並びで数えない。** prettier は引数が長くなると
 * `logError(` と `new Error(` の間で改行するので、隣接を前提にすると書式変更で
 * 数が変わる（実際に 3 → 2 になって落ちた）。helper 名の呼出だけを数え、
 * 宣言 1 件を除く形にすると書式に依存しない。
 */
function countFailureEmits(source: string): number {
  const calls = [...source.matchAll(/mailSendFailedMessage\(/gu)].length;
  const declarations = [
    ...source.matchAll(/function mailSendFailedMessage\(/gu),
  ].length;
  return calls - declarations;
}

/** 先頭固定部を組み立てる helper が、定数をそのまま prefix にしているか。 */
function prefixHelperUsesConstant(source: string): boolean {
  return source.includes("return `${MAIL_SEND_FAILED_MESSAGE}: ${cause}`;");
}

function readMetricFilter(metricHcl: string): string {
  return (
    /resource\s+"google_logging_metric"\s+"mail_send_failure"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? ""
  );
}

describe("メール送信失敗の signal は log metric の filter に一致する", () => {
  test("send.ts の先頭固定部が metric filter の前方一致に含まれる", () => {
    const message = readFailureMessagePrefix(readFileSync(SEND_PATH, "utf8"));
    const filter = readMetricFilter(readFileSync(METRIC_PATH, "utf8"));

    expect(filter.length).toBeGreaterThan(0);
    expect({
      message,
      filterHasMessage: filter.includes(`jsonPayload.message=~"^${message}"`),
      filterHasCategory: filter.includes('jsonPayload.category="EXTERNAL_API"'),
    }).toEqual({
      message,
      filterHasMessage: true,
      filterHasCategory: true,
    });
  });

  test("最終失敗の 3 経路すべてが先頭固定の helper を通る", () => {
    // payload 生成失敗 / provider エラー / 例外 の 3 つ。
    // 1 つでも素の可変文言に戻ると、その経路だけ metric から漏れる。
    const source = readFileSync(SEND_PATH, "utf8");
    expect(countFailureEmits(source)).toBe(3);
    expect(prefixHelperUsesConstant(source)).toBe(true);
  });

  test("突合ロジックが差分を検出する（見本）", () => {
    const filter =
      'jsonPayload.category="EXTERNAL_API"\njsonPayload.message=~"^Mail send failed"';

    // 落ちてはいけない形
    expect(filter.includes('jsonPayload.message=~"^Mail send failed"')).toBe(
      true,
    );

    // 落ちるべき形: 文言を変えたのに filter が古いまま
    expect(
      filter.includes('jsonPayload.message=~"^Mail delivery failed"'),
    ).toBe(false);

    // 前方一致なので、可変部分が後ろに付いても filter は当たる
    // （M11 の remediation メッセージがこの形で連結される）
    expect(
      "Mail send failed: Email sender address is not configured.".startsWith(
        "Mail send failed",
      ),
    ).toBe(true);
  });
});
