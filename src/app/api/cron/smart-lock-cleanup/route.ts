/**
 * SwitchBotスマートロック パスコード失効クリーンアップ Cron API
 *
 * `endTime`経過済み、または紐づく予約がCANCELLEDになったCONFIRMEDパスコードを
 * deleteKeyで失効させる。予約キャンセル時の即時deleteKey（失敗し得る）の
 * フォールバック回収も兼ねる。
 *
 * @module api/cron/smart-lock-cleanup
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { getSwitchBotConfig } from "@/shared/domain/settings/api-key-queries";
import { revokeExpiredSmartLockPasscodes } from "@/shared/domain/smart-lock/revoke-passcode";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "smartLockCleanupCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    const config = await getSwitchBotConfig();
    if (!config.enabled) {
      return jsonSuccess({ skipped: true, reason: "switchbot_disabled" });
    }

    const { revoked, failed } = await revokeExpiredSmartLockPasscodes(
      new Date(),
    );

    if (failed > 0) {
      logError(new Error("Some SwitchBot passcodes failed to revoke"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "smartLockCleanupCron", revoked, failed },
      });
    }

    return jsonSuccess({ revoked, failed });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "smartLockCleanupCron" },
    });
    return jsonError("Internal error", 500);
  }
}
