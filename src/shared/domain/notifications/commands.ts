import "server-only";

import { prisma } from "@/shared/db/prisma";
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
