import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { isCommentableContentType } from "@/admin/types/editor-comment";
import { getCommentThreadsQuery } from "@/shared/domain/editor-comments/queries";

const searchSchema = z.object({
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z
    .string()
    .uuid({ error: "contentId は有効な UUID である必要があります" }),
  status: z.enum(["ACTIVE", "RESOLVED"]).optional(),
});

export async function GET(request: Request) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    contentType: url.searchParams.get("contentType"),
    contentId: url.searchParams.get("contentId"),
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "クエリが不正です" },
      { status: 400 },
    );
  }

  const threads = await getCommentThreadsQuery(parsed.data);
  return NextResponse.json(threads);
}
