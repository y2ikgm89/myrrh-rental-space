import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { EventStatus } from "@generated/prisma/enums";
import { EVENT_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export type BulkSetStatusEventsResult = {
  count: number;
  newStatus: EventStatus;
  affectedIds: string[];
  rejectedIds: string[];
};

/**
 * 複数イベントのステータスを一括変更する。
 *
 * - soft delete 済み（deletedAt が non-null）のイベントは対象外
 * - 同一ステータスへの変更は no-op でスキップ
 * - EVENT_STATUS_TRANSITIONS に従い遷移不可なものは rejectedIds に積む
 * - 戻り値の affectedIds は cache invalidation / メール通知用
 */
export async function bulkSetStatusEventsCommand(
  ids: string[],
  newStatus: EventStatus,
): Promise<BulkSetStatusEventsResult> {
  if (ids.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds: [] };
  }

  const targets = await prisma.event.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, status: true },
  });

  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = EVENT_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      allowedIds.push(t.id);
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (allowedIds.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const result = await prisma.event.updateMany({
    where: { id: { in: allowedIds }, deletedAt: null },
    data: { status: newStatus },
  });

  return {
    count: result.count,
    newStatus,
    affectedIds: allowedIds,
    rejectedIds,
  };
}
