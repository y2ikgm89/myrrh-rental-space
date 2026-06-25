import "server-only";

import { prisma } from "@/shared/db/prisma";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { Prisma } from "@generated/prisma/client";

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

/** Client Component 用（createdAt は ISO 文字列） */
export type SerializedAdminNotificationData = Omit<
  AdminNotificationData,
  "createdAt"
> & {
  createdAt: string;
};

type GetNotificationsParams = {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
};

export async function getNotificationsQuery(params: GetNotificationsParams) {
  const { type, isRead } = params;
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({ page: params.page, limit: params.perPage });

  const where: Prisma.AdminNotificationWhereInput = {};
  if (type) where.type = type;
  if (isRead !== undefined) where.isRead = isRead;

  const [total, notifications] = await Promise.all([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);

  return {
    notifications,
    total,
    page,
    perPage,
    totalPages: calcTotalPages(total, perPage),
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
