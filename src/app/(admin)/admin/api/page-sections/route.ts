import { NextResponse } from "next/server";
import { z } from "zod";
import { checkResourceAccess } from "@/admin/lib/action-auth";
import { getPageSectionsQuery } from "@/shared/domain/sections/admin-queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const searchSchema = z.object({
  pageId: z.string().uuid({ error: "pageId が不正です" }),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    pageId: url.searchParams.get("pageId"),
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "pageId が不正です");
  }

  const auth = await checkResourceAccess(
    "page",
    "read",
    parsed.data.pageId,
    request.headers,
  );
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const sections = await getPageSectionsQuery(parsed.data.pageId);
  return NextResponse.json(sections);
}
