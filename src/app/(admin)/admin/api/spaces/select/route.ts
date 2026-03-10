/**
 * スペース選択用API（管理画面）
 *
 * エディタなどのクライアントコンポーネントから参照するため、
 * Route Handler 経由で提供する。
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getSpacesForSelectQuery } from "@/shared/domain/spaces/queries";
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
    const auth = await checkPermission("space", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    return jsonSuccess(await getSpacesForSelectQuery());
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminSpacesSelect" },
    });
    return jsonError("Internal server error", 500);
  }
}
