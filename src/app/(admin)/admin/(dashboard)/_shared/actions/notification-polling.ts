"use server";

import { checkAdminAuth } from "@/admin/lib/action-auth";
import { getUnreadNotificationCount } from "@/admin/queries/notification";

export async function fetchUnreadCount(): Promise<number> {
  const auth = await checkAdminAuth();
  if (!auth.success) return 0;
  return getUnreadNotificationCount();
}
