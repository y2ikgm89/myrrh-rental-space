/**
 * 顧客の重複候補検知 Cron
 *
 * emailCanonical または phoneNumber が完全一致する複数顧客を検知し、
 * Customer.flagReasons に DUPLICATE_CANDIDATE を付与して管理者通知を生成する。
 * Cloud Scheduler から daily（毎日 03:00 JST）で起動する想定。
 *
 * feature module gate は意図的に設けない。顧客データは単一モジュールに
 * 紐付かないため、複数モジュール状態でも検知対象が存在する。
 *
 * 自動マージ・レコード削除はしない。検知結果はフラグ付与のみで、
 * 最終判断は常に管理者（顧客一覧から「重複顧客」フィルタ・詳細画面から確認する）。
 *
 * 認証: Cloud Scheduler OIDC token
 *
 * 重複通知抑制は「通知の生成」だけを対象にし、検知・flagReasons への反映は
 * 毎回実行する（customer-risk-scan の週次実装をそのまま流用すると、抑制チェックが
 * 検知処理自体まで止めてしまい、daily 実行の意味が「実質週次」に縮退する
 * ——`reconcileFlagReasonsCommand` は冪等かつ軽量なので、通知だけを間引けば十分）。
 * `DEDUP_DAYS` は週次 cron の値をそのまま流用せず、daily cadence 用に短縮する
 * （Scheduler の同日リトライ・手動再実行での通知重複だけを防ぐのが目的）。
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  applyDuplicateCandidateFlagsCommand,
  detectDuplicateCandidates,
} from "@/shared/domain/customers/duplicate-detection";
import {
  createNotificationCommand,
  hasRecentNotificationOfType,
} from "@/shared/domain/notifications/commands";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

/**
 * 同 type の通知を重複生成しないためのルックバック日数。daily cadence 用に
 * 1 日（Scheduler の同日リトライ・手動再実行での通知重複だけを防ぐ）。
 * 検知・flagReasons への反映自体はこの値に関わらず毎回実行する。
 */
const NOTIFICATION_DEDUP_DAYS = 1;

async function handleGet(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "customerDuplicateScan",
    });
    if (authResult) return authResult;

    const detected = await detectDuplicateCandidates();

    if (detected.length === 0) {
      logger.info("Customer duplicate scan: no duplicate candidates detected");
      return jsonSuccess({ detected: 0 });
    }

    await applyDuplicateCandidateFlagsCommand(detected);

    // 通知だけを抑制する（検知・フラグ付与は上で毎回実行済み）。直近 1 日以内に
    // 同 type 通知が既にあれば no-op（Scheduler 再試行・手動再実行対策）。
    if (
      await hasRecentNotificationOfType(
        NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED,
        NOTIFICATION_DEDUP_DAYS,
      )
    ) {
      logger.info(
        "Customer duplicate scan: flags applied, recent notification exists, skipping notification",
        {
          detected: detected.length,
          dedupDays: NOTIFICATION_DEDUP_DAYS,
        },
      );
      return jsonSuccess({ detected: detected.length, notified: false });
    }

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED,
      title: `${String(detected.length)}件の重複顧客候補を検知しました`,
      message:
        "重複の疑いがあるフラグを付与しました。顧客一覧から確認してください。",
    });

    logger.info("Customer duplicate scan completed", {
      detected: detected.length,
    });

    return jsonSuccess({ detected: detected.length, notified: true });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "customerDuplicateScan" },
    });
    return jsonError("Customer duplicate scan failed", 500);
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
