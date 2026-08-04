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
} as const satisfies Prisma.AdminNotificationSelect;

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

/**
 * ベル / ダッシュボード用の直近通知。
 *
 * 未読を優先し、足りなければ既読で埋める。
 * （全件未読数バッジと「最新 N 件」一覧の食い違いを防ぐ）
 */
export async function getRecentNotificationsQuery(limit = 10) {
  const unread = await prisma.adminNotification.findMany({
    where: { isRead: false },
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (unread.length >= limit) {
    return unread;
  }
  const remaining = limit - unread.length;
  const read = await prisma.adminNotification.findMany({
    where: { isRead: true },
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: remaining,
  });
  return [...unread, ...read];
}
