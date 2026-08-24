import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { authorizeEditorCommentContentAccess } from "@/admin/lib/editor-comment-auth";
import {
  getEditorCommentThreadContentRef,
  getThreadDetailQuery,
} from "@/shared/domain/editor-comments/queries";
import {
  getRouteErrorStatus,
  jsonError,
  jsonValidationError,
} from "@/shared/lib/route-responses";

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

  // 1. 認証 → 2. 解決 → 3. 認可。逆順だと threadId の存否が認証前に見える（監査 A-57）。
  const authResult = await checkAdminAuth(request.headers);
  if (!authResult.success) {
    return jsonError(
      authResult.error.error,
      getRouteErrorStatus(authResult.error.error),
    );
  }

  const contentRef = await getEditorCommentThreadContentRef(parsed.data.id);
  if (!contentRef) {
    return jsonError("スレッドが見つかりません", 404);
  }

  const auth = await authorizeEditorCommentContentAccess(
    authResult.user,
    contentRef.contentType,
    contentRef.contentId,
    "read",
  );
  if (!auth.success) {
    return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
  }

  const thread = await getThreadDetailQuery(parsed.data.id);
  return NextResponse.json(thread);
}
