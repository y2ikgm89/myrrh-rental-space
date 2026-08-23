/**
 * **observability の 2 文書が名指しする alert が、Terraform に実在すること。**
 *
 * ## なぜ
 *
 * 監査 A-73 / A-86: `docs/observability/slo.md` は自ら「実装の SSoT は
 * `terraform/monitoring.tf`」「数値の正本は `terraform/monitoring.tf`」と宣言しながら、
 * **存在しないリソース名 `configuration_critical` を挙げていた**（実体は `severity_critical`）。
 * 同じことを述べる `alerting.md` は正しい名前を使っており、2 文書が食い違っていた。
 *
 * 同種の drift はこれで 3 回目。`mail_send_failure`（#2516）と
 * `db_health_probe_failure`（#2558）は alert を足したのに slo.md の表へ追記されず、
 * **「6 signals」と書いてあるのに実体は 8 本**になっていた。
 * 「2 回以上出た指摘は gate にする」の条件を満たすのでここで機械強制する。
 *
 * ## 何を見るか
 *
 * 1. 2 文書が名指しする alert 名が `monitoring.tf` に実在すること（誤記の検出）
 * 2. `monitoring.tf` の alert が 2 文書の**両方**に載っていること（追記漏れの検出）
 *
 * 2 が無いと「新しい alert を足したが誰も文書化しない」が通ってしまう。
 * 実際 `mail_send_failure` / `db_health_probe_failure` がその形だった。
 *
 * ## 直し方
 *
 * alert policy を足したら `slo.md` の閾値表と `alerting.md` の Signals 表の両方に
 * 1 行足す。消したら両方から消す。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

/** `terraform/monitoring.tf` に実在する alert policy 名。 */
function terraformAlertNames(hcl: string): string[] {
  return [
    ...hcl.matchAll(
      /resource\s+"google_monitoring_alert_policy"\s+"([a-z0-9_]+)"/gu,
    ),
  ].map((match) => match[1] ?? "");
}

/** `alerting.md` が `google_monitoring_alert_policy.NAME` の形で挙げる名前。 */
function alertingDocNames(markdown: string): string[] {
  return [
    ...markdown.matchAll(/google_monitoring_alert_policy\.([a-z0-9_]+)/gu),
  ].map((match) => match[1] ?? "");
}

/**
 * `slo.md` の閾値表の 1 列目。
 *
 * 表の外の散文にも backtick 付きの語は出るので、**行頭が `| \`` の行だけ**を見る。
 * （行頭固定にしないと散文の言及を拾って誤検知する — 過去に踏んだ形）
 */
function sloDocNames(markdown: string): string[] {
  return [...markdown.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|/gmu)].map(
    (match) => match[1] ?? "",
  );
}

describe("observability 文書の alert 名は Terraform と一致する", () => {
  const terraform = terraformAlertNames(read("terraform", "monitoring.tf"));
  const alerting = alertingDocNames(
    read("docs", "observability", "alerting.md"),
  );
  const slo = sloDocNames(read("docs", "observability", "slo.md"));

  test("走査が空振りしていない", () => {
    expect(terraform.length).toBeGreaterThan(5);
    expect(alerting.length).toBeGreaterThan(5);
    expect(slo.length).toBeGreaterThan(5);
  });

  test("文書が名指しする alert は Terraform に実在する", () => {
    const known = new Set(terraform);
    expect({
      alerting: alerting.filter((name) => !known.has(name)),
      slo: slo.filter((name) => !known.has(name)),
    }).toEqual({ alerting: [], slo: [] });
  });

  test("Terraform の alert は両方の文書に載っている", () => {
    const inAlerting = new Set(alerting);
    const inSlo = new Set(slo);
    expect({
      missingFromAlerting: terraform.filter((name) => !inAlerting.has(name)),
      missingFromSlo: terraform.filter((name) => !inSlo.has(name)),
    }).toEqual({ missingFromAlerting: [], missingFromSlo: [] });
  });

  test("突合ロジックが差分を検出する（見本）", () => {
    const hcl = `resource "google_monitoring_alert_policy" "severity_critical" {}`;
    expect(terraformAlertNames(hcl)).toEqual(["severity_critical"]);

    // 落ちるべき形: 実在しない名前
    expect(
      sloDocNames("| `configuration_critical` | any 1 | …|").filter(
        (name) => !new Set(terraformAlertNames(hcl)).has(name),
      ),
    ).toEqual(["configuration_critical"]);

    // 落ちてはいけない形
    expect(
      sloDocNames("| `severity_critical` | any 1 | …|").filter(
        (name) => !new Set(terraformAlertNames(hcl)).has(name),
      ),
    ).toEqual([]);

    // 行頭固定なので、散文中の backtick は拾わない
    expect(
      sloDocNames("`severity_critical` は CRITICAL ログ全件で鳴る。"),
    ).toEqual([]);
  });
});
