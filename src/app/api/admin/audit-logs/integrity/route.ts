import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { verifyAuditLogIntegrity } from "@/shared/domain/audit-log/integrity";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { getRouteErrorStatus } from "@/shared/lib/route-responses";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function noStoreJsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("auditLog", "manage", request.headers);
    if (!auth.success) {
      return noStoreJsonError(
        auth.error.error,
        getRouteErrorStatus(auth.error.error),
      );
    }

    await createAuditLogRecord({
      userId: auth.user.id,
      action: "INTEGRITY_CHECK",
      resource: "auditLog",
      metadata: {
        operation: "verifyAuditLogIntegrity",
      },
    });

    const result = await verifyAuditLogIntegrity();

    return Response.json(result, {
      status: result.ok ? 200 : 409,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "verifyAuditLogIntegrity" },
    });
    return noStoreJsonError("監査ログの完全性検証に失敗しました", 500);
  }
}
