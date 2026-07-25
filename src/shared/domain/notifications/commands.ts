import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { prisma } from "@/shared/db/prisma";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";
import type { NotificationType } from "@/shared/lib/validations/enums/helpers";

/** AdminNotification.title / message の DB 上限（schema.prisma と同期） */
const TITLE_MAX = 200;
const MESSAGE_MAX = 500;

type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
};

function truncateField(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}

function isPrismaRecordNotFoundError(error: unknown): boolean {
  return isRecord(error) && error["code"] === "P2025";
}

export async function createNotificationCommand(
  input: CreateNotificationInput,
): Promise<void> {
  await prisma.adminNotification.create({
    data: {
      type: input.type,
      title: truncateField(input.title, TITLE_MAX),
      message: truncateField(input.message, MESSAGE_MAX),
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
  try {
    await prisma.adminNotification.update({
      where: { id },
      data: { isRead: true },
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      throw new DomainError("通知が見つかりません", "NOT_FOUND");
    }
    throw error;
  }
}

export async function markAllAsReadCommand(): Promise<void> {
  await prisma.adminNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
}

export async function deleteNotificationCommand(id: string): Promise<void> {
  try {
    await prisma.adminNotification.delete({
      where: { id },
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      throw new DomainError("通知が見つかりません", "NOT_FOUND");
    }
    throw error;
  }
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

/**
 * 古い通知を削除する。
 *
 * - 通常通知: `olderThanDays` 超を削除（既読・未読を問わない）
 * - セキュリティ系: 未読は保持し、既読のみ同期間で削除（長期未確認の改ざん検知を守る）
 */
export async function deleteOldNotificationsCommand(
  olderThanDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * MS_PER_DAY);
  const securityTypes: NotificationType[] = [
    "security_login_failed_spike",
    "security_permission_denied",
    "security_role_change",
    "security_audit_integrity_failed",
  ];

  const [normal, securityRead] = await Promise.all([
    prisma.adminNotification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        type: { notIn: securityTypes },
      },
    }),
    prisma.adminNotification.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        type: { in: securityTypes },
        isRead: true,
      },
    }),
  ]);
  return normal.count + securityRead.count;
}
