import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { logger } from "@/shared/lib/errors/logger-core";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import {
  getDataRetentionConfig,
  runDataRetentionPurge,
} from "@/shared/domain/data-retention/commands";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

/**
 * データ保持ポリシー cron — 個情法 22 条 / GDPR 5(1)(e) 準拠。
 *
 * feature module `data-retention` が ON かつ Settings.dataRetention の各月数が > 0
 * のフィールドについて、保持期限を経過した以下のデータを削除・匿名化する:
 *
 * - Session / Verification — 完全削除（PII 相当）
 * - Reservation.guest* — 完了予約の guest 情報を NULL 化
 * - EventRegistration（ゲスト申込のみ）— 開催終了後に氏名を placeholder 化し
 *   メール・電話・備考を NULL 化。会員申込は Customer 匿名化に連動するので対象外
 * - Inquiry — 完全削除
 * - INACTIVE Customer — PII フィールドを non-routable 値で匿名化
 * - PendingCustomerEmailChange / PendingCustomerMerge — `expiresAt` を過ぎた行を
 *   完全削除。**月数設定を持たない**（TTL 1 時間の使い捨てトークン台帳で、
 *   期限切れ = ゴミ。保持方針を選ぶ余地が無い）
 *
 * 実装契約は `src/shared/domain/data-retention/commands.ts` の JSDoc を参照。
 * 誤設定時の scoping / opt-out（月数 0）は同ファイル内で一元化されている。
 *
 * ## 実行契約
 *
 * - Cloud Scheduler 経由の HTTP GET のみ（`authorizeCronRequest` が OIDC 検証）
 * - feature module OFF なら即 `{ skipped: "feature_disabled" }` で 200 return
 * - purge は per-request の Now を UTC で使う（cutoff 計算は `commands.ts` が担当）
 * - at-least-once の Cloud Scheduler retry を全 purge 関数の idempotency で吸収
 */
async function handleGet(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "dataRetentionCron",
    });
    if (authResult) return authResult;

    if (!(await isFeatureEnabled("data-retention"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const now = new Date();
    const config = await getDataRetentionConfig();
    const result = await runDataRetentionPurge(now, config);

    logger.info("Data retention purge completed", {
      config,
      result,
      ranAt: now.toISOString(),
    });

    return jsonSuccess({
      ranAt: now.toISOString(),
      config,
      result,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "dataRetentionCron" },
    });
    return jsonError("Data retention cron failed", 500);
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
