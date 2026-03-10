import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getBlockTemplates } from "@/shared/domain/block-template/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
} from "@/shared/lib/route-responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission(
      "blockTemplate",
      "read",
      request.headers,
    );
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    return jsonSuccess(await getBlockTemplates());
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminBlockTemplatesGet" },
    });

    return jsonError("Internal server error", 500);
  }
}
