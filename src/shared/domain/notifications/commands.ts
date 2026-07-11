import "server-only";

import { prisma } from "@/shared/db/prisma";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import type { NotificationType } from "@/shared/lib/validations/enums/helpers";

type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
};

export async function createNotificationCommand(
  input: CreateNotificationInput,
): Promise<void> {
  await prisma.adminNotification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      ...(input.resourceType !== undefined && {
        resourceType: input.resourceType,
      }),
      ...(input.resourceId !== undefined && {
        resourceId: input.resourceId,
      }),
    },
  });
}

export async function markAsReadCommand(id: string): Promise<void> {
  await prisma.adminNotification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllAsReadCommand(): Promise<void> {
  await prisma.adminNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
}

export async function deleteNotificationCommand(id: string): Promise<void> {
  await prisma.adminNotification.delete({
    where: { id },
  });
}

/**
 * 指定 type の通知が直近 N 日以内に作成されているかを確認する。
 * 週次 cron（FAQ_STALE 等）の重複通知抑制に使用する。
 */
export async function hasRecentNotificationOfType(
  type: NotificationType,
  withinDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * MS_PER_DAY);
  const existing = await prisma.adminNotification.findFirst({
    where: { type, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
}

export async function deleteOldNotificationsCommand(
  olderThanDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.adminNotification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}
