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
 * - INQUIRY_STATUS_TRANSITIONS に従い backward 遷移は rejectedIds に積む
 * - 戻り値の affectedIds は cache invalidation / メール通知用
 */
export async function bulkSetStatusInquiriesCommand(
  ids: string[],
  newStatus: InquiryStatus,
): Promise<BulkSetStatusInquiriesResult> {
  if (ids.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds: [] };
  }

  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });

  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = INQUIRY_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      allowedIds.push(t.id);
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (allowedIds.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const result = await prisma.inquiry.updateMany({
    where: { id: { in: allowedIds } },
    data: { status: newStatus },
  });

  return {
    count: result.count,
    newStatus,
    affectedIds: allowedIds,
    rejectedIds,
  };
}
