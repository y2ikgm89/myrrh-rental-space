import "server-only";

import {
  getNotificationsQuery,
  getUnreadCountQuery,
  getRecentNotificationsQuery,
} from "@/shared/domain/notifications/admin-queries";

export async function getNotifications(params: {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
}) {
  return getNotificationsQuery(params);
}

export async function getUnreadNotificationCount() {
  return getUnreadCountQuery();
}

export async function getRecentNotifications(limit?: number) {
  return getRecentNotificationsQuery(limit);
}
