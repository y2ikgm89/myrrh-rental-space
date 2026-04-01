/**
 * メディアAPI（管理画面）
 *
 * クライアント側からの取得・アップロードを Route Handler で受ける。
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  inferMediaType,
  mediaFiltersSchema,
  mediaPaginationSchema,
  parseMediaUploadFormData,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  validateFile,
} from "@/admin/lib/validations/media";
import { uploadMediaCommand } from "@/shared/domain/media/commands";
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
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
    const type = metadata.type ?? inferMediaType(file.type);
    const validation = validateFile(file, type);
    if (!validation.valid) {
      return jsonError(validation.error ?? "アップロードに失敗しました", 400);
    }

    const result = await uploadMediaCommand({
      file,
      folder: metadata.usage?.toLowerCase() || "general",
      uploadedBy: auth.user.id,
      type,
      usage: metadata.usage ?? null,
      alt: metadata.alt ?? null,
      title: metadata.title ?? null,
      description: metadata.description ?? null,
      tags: metadata.tags ?? [],
    });

    return jsonSuccess(result);
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "adminMediaUpload" },
    });
    return jsonError("アップロードに失敗しました", 500);
  }
}
