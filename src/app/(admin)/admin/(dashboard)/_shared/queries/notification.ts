import "server-only";

import {
  getNotificationsQuery,
  getUnreadCountQuery,
  getRecentNotificationsQuery,
} from "@/shared/domain/notifications/admin-queries";
import { requireAdminDashboardAccess } from "./_helpers";

export async function getNotifications(params: {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
}) {
  await requireAdminDashboardAccess();
  return getNotificationsQuery(params);
}

export async function getUnreadNotificationCount() {
  await requireAdminDashboardAccess();
  return getUnreadCountQuery();
}

export async function getRecentNotifications(limit?: number) {
  await requireAdminDashboardAccess();
  return getRecentNotificationsQuery(limit);
}
