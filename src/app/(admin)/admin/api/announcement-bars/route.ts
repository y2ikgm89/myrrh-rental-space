import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAnnouncementBars } from "@/shared/domain/settings/announcement-bar";

export async function GET(request: Request) {
  const auth = await checkPermission(
    "announcementBar",
    "read",
    request.headers,
  );
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const items = await getAnnouncementBars();
  return NextResponse.json({ items, total: items.length });
}
