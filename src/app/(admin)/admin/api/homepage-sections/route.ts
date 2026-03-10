import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getHomepageSectionsQuery } from "@/shared/domain/sections/admin-queries";
import { jsonError } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  const auth = await checkPermission("settings", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const sections = await getHomepageSectionsQuery();
  return NextResponse.json(sections);
}
