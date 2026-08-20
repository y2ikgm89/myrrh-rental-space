import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getPostTags } from "@/shared/domain/posts/admin-queries";
import { getRouteErrorStatus, jsonError } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
  }

  const tags = await getPostTags();
  return NextResponse.json(tags);
}
