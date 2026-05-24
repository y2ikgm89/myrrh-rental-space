import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { isEditorRole } from "@/admin/lib/permissions";
import { getDeletedPagesListQuery } from "@/shared/domain/pages/admin-queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { apiRateLimiter, getClientIp } from "@/shared/lib/rate-limit";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
} from "@/shared/lib/route-responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission("page", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    // 認証後に rate-limit 適用（業界標準 Stripe / Linear admin reader hardening）
    const rateLimit = await apiRateLimiter.check(getClientIp(request));
    if (!rateLimit.success) {
      return jsonError(
        "リクエストが多すぎます。しばらくしてからお試しください。",
        429,
      );
    }

    const allowedPageIds = isEditorRole(auth.user.role)
      ? await getAssignedPageIdsForUser(auth.user.id)
      : undefined;
    const pages = await getDeletedPagesListQuery(allowedPageIds);

    return jsonSuccess(pages);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminDeletedPagesGet" },
    });

    return jsonError("Internal server error", 500);
  }
}
