import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { InquiryStatus } from "@generated/prisma/enums";
import { INQUIRY_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export type BulkSetStatusInquiriesResult = {
  count: number;
  newStatus: InquiryStatus;
  affectedIds: string[];
  rejectedIds: string[];
};

/**
 * 複数お問い合わせのステータスを一括変更する（forward only）。
 *
 * - 同一ステータスへの変更は no-op でスキップ
 * - INQUIRY_STATUS_TRANSITIONS に従い禁止遷移は rejectedIds に積む
 * - soft-deleted (`deletedAt IS NOT NULL`) の inquiry は対象外
 * - status 変更ごとに InquiryStatusHistory を append する
 */
export async function bulkSetStatusInquiriesCommand(
  ids: string[],
  newStatus: InquiryStatus,
  changedById: string | null,
  reason?: string,
): Promise<BulkSetStatusInquiriesResult> {
  if (ids.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds: [] };
  }

  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, status: true },
  });

  const allowedTargets: { id: string; fromStatus: InquiryStatus }[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = INQUIRY_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      allowedTargets.push({ id: t.id, fromStatus: t.status });
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (allowedTargets.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const allowedIds = allowedTargets.map((t) => t.id);

  const affected = await prisma.$transaction(async (tx) => {
    const result = await tx.inquiry.updateMany({
      where: { id: { in: allowedIds } },
      data: { status: newStatus },
    });
    await tx.inquiryStatusHistory.createMany({
      data: allowedTargets.map((t) => ({
        inquiryId: t.id,
        fromStatus: t.fromStatus,
        toStatus: newStatus,
        changedById,
        reason: reason ?? null,
      })),
    });
    return result.count;
  });

  return {
    count: affected,
    newStatus,
    affectedIds: allowedIds,
    rejectedIds,
  };
}
