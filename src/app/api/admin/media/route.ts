/**
 * Media API Route
 *
 * GET: メディア一覧取得
 * POST: メディアアップロード
 *
 * Turbopack HMR互換性のため、Server ActionsではなくAPI Routesを使用
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionUser } from "@/shared/lib/auth";
import { getMediaListQuery } from "@/shared/domain/media/queries";
import { uploadMediaCommand } from "@/shared/domain/media/commands";
import { canAccessAdmin, hasPermission } from "@/admin/lib/permissions";
import {
  MediaType,
  MediaUsage,
  isValidMediaType,
  isValidMediaUsage,
} from "@/shared/lib/validations/enums";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * GET /api/admin/media
 * メディア一覧を取得
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const user = getSessionUser(session);

  if (!user || !canAccessAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "media", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "24", 10)),
  );

  const result = await getMediaListQuery(
    {
      type: type && isValidMediaType(type) ? type : undefined,
      search: search ?? undefined,
    },
    { page, limit },
  );

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
}

/**
 * POST /api/admin/media
 * メディアをアップロード
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const user = getSessionUser(session);

  if (!user || !canAccessAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role, "media", "create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // ファイルタイプの検証
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, AVIF" },
        { status: 400 },
      );
    }

    // ファイルサイズの検証（10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size: 10MB" },
        { status: 400 },
      );
    }

    // メタデータ
    const typeStr = formData.get("type")?.toString();
    const usageStr = formData.get("usage")?.toString();
    const type: MediaType =
      typeStr && isValidMediaType(typeStr) ? typeStr : MediaType.IMAGE;
    const usage: MediaUsage =
      usageStr && isValidMediaUsage(usageStr) ? usageStr : MediaUsage.GENERAL;
    const alt = formData.get("alt")?.toString() || null;
    const title = formData.get("title")?.toString() || null;
    const media = await uploadMediaCommand({
      file,
      folder: usage.toLowerCase(),
      uploadedBy: user.id,
      type,
      usage,
      alt,
      title,
      description: null,
      tags: [],
    });

    return NextResponse.json({
      success: true,
      id: media.id,
      url: media.url,
      filename: file.name,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "uploadMedia" },
    });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
