import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import type { Resource } from "@/admin/lib/permissions";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

const previewRequestSchema = z.object({
  contentJson: z.string(),
  resource: z.enum(["post", "news", "page"]).default("post"),
});

type PreviewResponse = {
  html: string;
};

function isPreviewResource(value: string): value is Extract<Resource, "post" | "news" | "page"> {
  return value === "post" || value === "news" || value === "page";
}

export async function POST(request: Request): Promise<NextResponse<PreviewResponse | { error: string }>> {
  const body = await request.json().catch(() => null);
  const parsed = previewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "リクエストが不正です" },
      { status: 400 },
    );
  }

  const { contentJson, resource } = parsed.data;
  if (!isPreviewResource(resource)) {
    return NextResponse.json({ error: "resource が不正です" }, { status: 400 });
  }

  const auth = await checkPermission(resource, "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  if (!contentJson) {
    return NextResponse.json({ html: "" });
  }

  try {
    const html = await renderEditorStateToHtmlLazy(contentJson);
    return NextResponse.json({ html });
  } catch (error) {
    logger.error("プレビュー HTML 変換に失敗しました", {
      error: getErrorMessage(error),
      resource,
    });
    return NextResponse.json(
      { error: "プレビューの生成に失敗しました" },
      { status: 500 },
    );
  }
}
