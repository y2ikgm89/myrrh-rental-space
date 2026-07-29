import { NextResponse } from "next/server";
import { z } from "zod";
import { checkEditorCommentContentAccess } from "@/admin/lib/editor-comment-auth";
import {
  getEditorCommentThreadContentRef,
  getThreadDetailQuery,
} from "@/shared/domain/editor-comments/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const paramsSchema = z.object({
  id: z.uuid({ error: "threadId は有効な UUID である必要があります" }),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return jsonValidationError(parsed.error, "threadId が不正です");
  }

  const contentRef = await getEditorCommentThreadContentRef(parsed.data.id);
  if (!contentRef) {
    return jsonError("スレッドが見つかりません", 404);
  }

  const auth = await checkEditorCommentContentAccess(
    contentRef.contentType,
    contentRef.contentId,
    "read",
    request.headers,
  );
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const thread = await getThreadDetailQuery(parsed.data.id);
  return NextResponse.json(thread);
}
