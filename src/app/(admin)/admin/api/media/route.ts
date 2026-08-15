/**
 * メディア一覧 API（管理画面）
 *
 * 取得は Route Handler GET。アップロードは `uploadMedia` Server Action に一本化。
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  mediaFiltersSchema,
  mediaPaginationSchema,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
} from "@/admin/lib/validations/media";
import { getMediaListQuery } from "@/shared/domain/media/queries";
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
  jsonValidationError,
} from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission("media", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const url = new URL(request.url);

    const filtersResult = mediaFiltersSchema.safeParse({
      type: parseMediaTypeFilter(url.searchParams.get("type")),
      usage: parseMediaUsageFilter(url.searchParams.get("usage")),
      search: url.searchParams.get("search") || undefined,
      mimeType: url.searchParams.get("mimeType") || undefined,
    });

    if (!filtersResult.success) {
      return jsonValidationError(filtersResult.error);
    }

    const paginationResult = mediaPaginationSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!paginationResult.success) {
      return jsonValidationError(paginationResult.error);
    }

    const result = await getMediaListQuery(
      omitUndefined(filtersResult.data),
      paginationResult.data,
    );
    return jsonSuccess(result);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "adminMediaGet" },
    });
    return jsonError("Internal server error", 500);
  }
}
