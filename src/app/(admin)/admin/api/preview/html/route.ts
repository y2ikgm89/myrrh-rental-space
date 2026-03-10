import type { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import type { Resource } from "@/admin/lib/permissions";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { parseJsonRequest } from "@/shared/lib/request-parsing";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

const previewRequestSchema = z.object({
  contentJson: z.string(),
  resource: z.enum(["post", "news", "page"]).default("post"),
});

type PreviewResponse = {
  html: string;
};

function isPreviewResource(
  value: string,
): value is Extract<Resource, "post" | "news" | "page"> {
  return value === "post" || value === "news" || value === "page";
}

export async function POST(
  request: Request,
): Promise<NextResponse<PreviewResponse | { error: string }>> {
  const parsed = await parseJsonRequest(request, previewRequestSchema, {
    invalidJsonMessage: "JSON が不正です",
    invalidBodyMessage: "リクエストが不正です",
  });
  if (!parsed.success) {
    return parsed.response;
  }

  const { contentJson, resource } = parsed.data;
  if (!isPreviewResource(resource)) {
    return jsonError("resource が不正です", 400);
  }

  const auth = await checkPermission(resource, "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  if (!contentJson) {
    return jsonSuccess({ html: "" });
  }

  try {
    const html = await renderEditorStateToHtmlLazy(contentJson);
    return jsonSuccess({ html });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "previewHtml", resource },
    });
    return jsonError("プレビューの生成に失敗しました", 500);
  }
}
