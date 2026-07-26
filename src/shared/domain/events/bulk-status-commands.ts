import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
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

  const allowedTargets: { id: string; fromStatus: EventStatus }[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = EVENT_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      allowedTargets.push({ id: t.id, fromStatus: t.status });
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (allowedTargets.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const affectedIds: string[] = [];

  for (const target of allowedTargets) {
    const claim = await prisma.event.updateMany({
      where: {
        id: target.id,
        deletedAt: null,
        status: target.fromStatus,
      },
      data: { status: newStatus },
    });
    if (claim.count === 1) {
      affectedIds.push(target.id);
    } else {
      rejectedIds.push(target.id);
    }
  }

  return {
    count: affectedIds.length,
    newStatus,
    affectedIds,
    rejectedIds,
  };
}
