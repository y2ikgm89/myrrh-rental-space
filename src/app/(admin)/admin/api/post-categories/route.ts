import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getPostCategories } from "@/shared/domain/posts/admin-queries";

export async function GET(request: Request) {
  const auth = await checkPermission("post", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const categories = await getPostCategories();
  return NextResponse.json(categories);
}
