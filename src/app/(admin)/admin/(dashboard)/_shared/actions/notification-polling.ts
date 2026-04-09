"use server";

import { getUnreadNotificationCount } from "@/admin/queries/notification";

export async function fetchUnreadCount(): Promise<number> {
  return getUnreadNotificationCount();
}
