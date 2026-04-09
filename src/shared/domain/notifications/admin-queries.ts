import "server-only";

import { prisma } from "@/shared/db/prisma";

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  resourceType: true,
  resourceId: true,
  isRead: true,
  createdAt: true,
} as const;

export type AdminNotificationData = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: Date;
};

type GetNotificationsParams = {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
};

export async function getNotificationsQuery(params: GetNotificationsParams) {
  const { page, perPage, type, isRead } = params;

  const where: Record<string, unknown> = {};
  if (type) where["type"] = type;
  if (isRead !== undefined) where["isRead"] = isRead;

  const [total, notifications] = await prisma.$transaction([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return {
    notifications,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

export async function getUnreadCountQuery(): Promise<number> {
  return prisma.adminNotification.count({
    where: { isRead: false },
  });
}

export async function getRecentNotificationsQuery(limit = 10) {
  return prisma.adminNotification.findMany({
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
