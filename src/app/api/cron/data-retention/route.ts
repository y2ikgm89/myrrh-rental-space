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
import { isFeatureEnabled } from "@/shared/lib/features/check";
import {
  getDataRetentionConfig,
  runDataRetentionPurge,
} from "@/shared/domain/data-retention/commands";

/**
 * データ保持ポリシー cron — 個情法 22 条 / GDPR 5(1)(e) 準拠。
 *
 * feature module `data-retention` が ON かつ Settings.dataRetention の各月数が > 0
 * のフィールドについて、保持期限を経過した以下のデータを削除・匿名化する:
 *
 * - Session / Verification / login_attempts — 完全削除（PII 相当）
 * - Reservation.guest* — 完了予約の guest 情報を NULL 化
 * - Inquiry — 完全削除
 * - INACTIVE Customer — PII フィールドを non-routable 値で匿名化
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
export async function GET(request: Request) {
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
