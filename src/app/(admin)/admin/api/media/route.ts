/**
 * メディアAPI（管理画面）
 *
 * クライアント側からの取得・アップロードを Route Handler で受ける。
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission, logAction } from "@/admin/lib/action-auth";
import {
  mediaFiltersSchema,
  mediaPaginationSchema,
  parseMediaUploadFormData,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  preValidateMediaFile,
} from "@/admin/lib/validations/media";
import { uploadMediaCommand } from "@/shared/domain/media/commands";
import { finalizeMediaMutation } from "@/shared/domain/media/cache";
import { getMediaListQuery } from "@/shared/domain/media/queries";
import {
  isDomainError,
  type DomainErrorCode,
} from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
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
import { isSameAdminOrigin } from "@/shared/lib/http/assert-same-origin";

function domainErrorStatus(code: DomainErrorCode): number | null {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "DUPLICATE":
      return 409;
    case "UNEXPECTED":
      return null;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isSameAdminOrigin(request.headers)) {
      return jsonError("Forbidden", 403);
    }

    const auth = await checkPermission("media", "create", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const formData = await request.formData();
    const parsedUpload = parseMediaUploadFormData(formData);
    if (parsedUpload.kind === "error") {
      return jsonError(parsedUpload.error, 400);
    }
    if (parsedUpload.kind === "validation-error") {
      return jsonValidationError(parsedUpload.error);
    }

    const { file, metadata } = parsedUpload.data;
    const preCheck = preValidateMediaFile(file);
    if (!preCheck.valid) {
      return jsonError(preCheck.error, 400);
    }

    const result = await uploadMediaCommand({
      file,
      folder: metadata.usage?.toLowerCase() || "general",
      uploadedBy: auth.user.id,
      usage: metadata.usage ?? null,
      alt: metadata.alt ?? null,
      title: metadata.title ?? null,
      description: metadata.description ?? null,
      tags: metadata.tags ?? [],
    });

    finalizeMediaMutation([result.id]);

    fireAndForget(logAction(auth.user.id, "create", "media", result.id), {
      operation: "adminMediaUpload.logAction",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        resource: "media",
        action: "create",
        userId: auth.user.id,
      },
    });

    return jsonSuccess(result);
  } catch (error: unknown) {
    unstable_rethrow(error);
    if (isDomainError(error)) {
      const status = domainErrorStatus(error.code);
      if (status !== null) {
        return jsonError(error.message, status);
      }
    }
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "adminMediaUpload" },
    });
    return jsonError("アップロードに失敗しました", 500);
  }
}
