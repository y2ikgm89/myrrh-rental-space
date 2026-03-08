import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getThreadDetailQuery } from "@/shared/domain/editor-comments/queries";

const paramsSchema = z.object({
  id: z.string().uuid({ error: "threadId は有効な UUID である必要があります" }),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "threadId が不正です" },
      { status: 400 },
    );
  }

  const thread = await getThreadDetailQuery(parsed.data.id);
  if (!thread) {
    return NextResponse.json({ error: "スレッドが見つかりません" }, { status: 404 });
  }

  return NextResponse.json(thread);
}
