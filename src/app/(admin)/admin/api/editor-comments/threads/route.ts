import { NextResponse } from "next/server";
import { z } from "zod";
import { checkEditorCommentContentAccess } from "@/admin/lib/editor-comment-auth";
import { isCommentableContentType } from "@/admin/types/editor-comment";
import { getCommentThreadsQuery } from "@/shared/domain/editor-comments/queries";
import {
  getRouteErrorStatus,
  jsonError,
  jsonValidationError,
} from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";

const searchSchema = z.object({
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z.uuid({ error: "contentId は有効な UUID である必要があります" }),
  status: z.enum(["ACTIVE", "RESOLVED"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    contentType: url.searchParams.get("contentType"),
    contentId: url.searchParams.get("contentId"),
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "クエリが不正です");
  }

  const auth = await checkEditorCommentContentAccess(
    parsed.data.contentType,
    parsed.data.contentId,
    "read",
    request.headers,
  );
  if (!auth.success) {
    return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
  }

  const threads = await getCommentThreadsQuery(omitUndefined(parsed.data));
  return NextResponse.json(threads);
}
