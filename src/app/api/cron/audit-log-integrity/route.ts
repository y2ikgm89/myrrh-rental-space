import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { verifyAuditLogIntegrity } from "@/shared/domain/audit-log/integrity";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

/**
 * 監査ログ (AuditLog) の HMAC ハッシュチェーン完全性を定期検証する。
 *
 * これまで `/api/admin/audit-logs/integrity` は SUPER_ADMIN が手動で開くまで
 * 一度も実行されなかった（改ざんがあっても誰も気づかない）。このジョブは同じ
 * `verifyAuditLogIntegrity()` を定期実行し、失敗時は CRITICAL で logError する。
 *
 * 改ざん検出は「ジョブの失敗」ではなく「ジョブが本来の目的を果たした結果」の
 * ため、result.ok が false でも HTTP は 200 を返す（customer-risk-scan と同型）。
 * Cloud Scheduler の自動リトライは改ざんを解消しないため意味がない。
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "auditLogIntegrityCron",
    });
    if (authResult) return authResult;

    await createAuditLogRecord({
      action: "INTEGRITY_CHECK",
      resource: "auditLog",
      metadata: {
        operation: "verifyAuditLogIntegrity",
        trigger: "cron",
      },
    });

    const result = await verifyAuditLogIntegrity();

    if (!result.ok) {
      logError(new Error("Audit log integrity check detected tampering"), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "auditLogIntegrityCron",
          checkedCount: result.checkedCount,
          failureCount: result.failures.length,
          firstFailure: result.failures[0],
        },
      });
    } else {
      logger.info("Audit log integrity check completed", {
        checkedCount: result.checkedCount,
        latestSequence: result.latestSequence,
      });
    }

    return jsonSuccess({
      ok: result.ok,
      checkedCount: result.checkedCount,
      failureCount: result.failures.length,
      checkedAt: result.checkedAt,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "auditLogIntegrityCron" },
    });
    return jsonError("Audit log integrity check failed", 500);
  }
}
