import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getThreadDetailQuery } from "@/shared/domain/editor-comments/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const paramsSchema = z.object({
  id: z.uuid({ error: "threadId は有効な UUID である必要があります" }),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return jsonValidationError(parsed.error, "threadId が不正です");
  }

  const thread = await getThreadDetailQuery(parsed.data.id);
  if (!thread) {
    return jsonError("スレッドが見つかりません", 404);
  }

  return NextResponse.json(thread);
}
