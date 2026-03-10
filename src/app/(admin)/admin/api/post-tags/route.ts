import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getPostTags } from "@/shared/domain/posts/admin-queries";
import { jsonError } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const tags = await getPostTags();
  return NextResponse.json(tags);
}
