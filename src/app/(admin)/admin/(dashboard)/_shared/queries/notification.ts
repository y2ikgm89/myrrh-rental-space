import "server-only";

import {
  getNotificationsQuery,
  getUnreadCountQuery,
  getRecentNotificationsQuery,
} from "@/shared/domain/notifications/admin-queries";
import { requireAdminPermission } from "./_helpers";

export async function getNotifications(params: {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
}) {
  await requireAdminPermission("notification", "read");
  return getNotificationsQuery(params);
}

export async function getUnreadNotificationCount() {
  await requireAdminPermission("notification", "read");
  return getUnreadCountQuery();
}

export async function getRecentNotifications(limit?: number) {
  await requireAdminPermission("notification", "read");
  return getRecentNotificationsQuery(limit);
}
