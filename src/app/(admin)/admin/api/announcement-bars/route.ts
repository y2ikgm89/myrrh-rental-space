import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAnnouncementBars } from "@/shared/domain/settings/announcement-bar";
import { jsonError } from "@/shared/lib/route-responses";

export async function GET(request: Request) {
  const auth = await checkPermission(
    "announcementBar",
    "read",
    request.headers,
  );
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const items = await getAnnouncementBars();
  return NextResponse.json({ items, total: items.length });
}
