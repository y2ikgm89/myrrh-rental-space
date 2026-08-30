/**
 * DB 到達性の合成プローブ Cron（監査 A-29）
 *
 * ## なぜ要るか
 *
 * `docs/observability/slo.md` は「admin の DB 到達性は `/api/health` の any-1 5xx
 * alert で見る」と書いていたが、**`/api/health` を叩く主体がリポジトリ内に存在しない**。
 *
 * - Cloud Run の probe は両サービスとも `/api/live`（DB を触らない契約）
 * - 外形監視（`.github/workflows/uptime.yml`）は公開面の `/api/live` だけ。
 *   admin は internal LB + IAP なので GitHub Actions からは到達できない
 * - `google_monitoring_uptime_check_config` は terraform に 1 つも無い
 * - `/api/health` は public surface では 404（匿名からの DB probe DoS 対策）
 *
 * つまり `health_probe_5xx` は「IAP 認証済みの人間が手で開いた瞬間」にしか
 * 評価対象のログが生まれない。DB が落ちても沈黙する。
 *
 * 他の cron は失敗を HIGH で記録するが、`reported_error_burst` の閾値は
 * 20 件 / 5 分で、運用者 1 人の管理画面トラフィックでは届かない。公開面の
 * `criticalFetch` は `'use cache'` の裏なのでキャッシュが温まっている間は
 * DB に触らない。**独立した検知経路が無い**のがこの route を足す理由。
 *
 * ## なぜ admin ではなく公開面なのか
 *
 * admin は Cloud Run direct IAP 配下で、Cloud Scheduler の OIDC token では
 * 通れない（2026-08-30 に外部 LB を全廃して `ingress = INGRESS_TRAFFIC_ALL` に
 * したが、塞いでいるのは ingress ではなく IAP なので結論は同じ）。DB は 2 サービスで
 * 共有なので、公開面から `SELECT 1` を打てば到達性は同じだけ分かる。
 *
 * ## 閾値の設計
 *
 * 失敗は **HIGH** で記録し、page するのは `db_health_probe_failure` metric が
 * 15 分で 3 件を超えたとき（`cron_oidc_failure` と同型）。Cloud Scheduler の
 * `retry_count = 3` があるので、**リトライで復帰する一過性のブリップは 1〜2 件**
 * で収まり、**リトライを使い切る本物の停止だけが 4 件に達する**。
 *
 * 認証: Cloud Scheduler OIDC token
 * べき等性: 読み取りのみ（副作用なし）
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { runDatabaseHealthCheck } from "@/shared/domain/system/queries";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

/**
 * log metric `db_health_probe_failure` の filter が前方一致で拾う固定文言。
 *
 * 可変部分（driver 由来のメッセージ）は後ろに連結する。先頭を固定しないと
 * filter が原理的に書けない（`mail_send_failure` と同じ設計）。
 * 変えるときは `terraform/monitoring.tf` の filter も同じ commit で変える。
 */
const DB_HEALTH_PROBE_FAILED_MESSAGE = "Database health probe failed";

async function handleGet(request: Request) {
  await connection();

  const authResult = await authorizeCronRequest({
    request,
    operation: "dbHealthProbe",
  });
  if (authResult) return authResult;

  try {
    await runDatabaseHealthCheck();
    return jsonSuccess({ status: "healthy" });
  } catch (error) {
    unstable_rethrow(error);
    const cause = normalizeError(error).message;
    logError(new Error(`${DB_HEALTH_PROBE_FAILED_MESSAGE}: ${cause}`), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "dbHealthProbe" },
    });
    // 5xx を返して Cloud Scheduler のリトライに乗せる（4 回目で alert 閾値に届く）。
    return jsonError("Database unreachable", 500);
  }
}

/**
 * cron service は `cpu_idle = true`（request 課金）なので、レスポンス送信後の
 * `after()` が完走する保証がない。`fireAndForget` の副作用をレスポンス前に
 * 待ち合わせる。cron にレスポンス遅延の要件は無い（Cloud Scheduler の
 * attempt_deadline は 300s）。理由は `withAwaitedSideEffects` の docblock。
 */
export async function GET(request: Request) {
  return withAwaitedSideEffects(() => handleGet(request));
}
