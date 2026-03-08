import { NextResponse } from "next/server";
import { z } from "zod";
import { checkResourceAccess } from "@/admin/lib/action-auth";
import { getPageSectionsQuery } from "@/shared/domain/sections/admin-queries";

const searchSchema = z.object({
  pageId: z.string().uuid({ error: "pageId が不正です" }),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    pageId: url.searchParams.get("pageId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "pageId が不正です" },
      { status: 400 },
    );
  }

  const auth = await checkResourceAccess(
    "page",
    "read",
    parsed.data.pageId,
    request.headers,
  );
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const sections = await getPageSectionsQuery(parsed.data.pageId);
  return NextResponse.json(sections);
}
