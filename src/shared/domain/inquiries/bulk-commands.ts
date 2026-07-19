import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkDeleteInquiriesResult = {
  count: number;
  affectedIds: string[];
};

/**
 * 複数のお問い合わせを一括 soft delete する。
 *
 * hard delete は data-retention cron の inquiryMonths 満了時のみ実行する。
 * すでに削除済み (deletedAt IS NOT NULL) は対象外。
 */
export async function bulkDeleteInquiriesCommand(
  ids: string[],
): Promise<BulkDeleteInquiriesResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedIds: [] };
  }

  const affectedIds = targets.map((t) => t.id);
  const now = new Date();
  const result = await prisma.inquiry.updateMany({
    where: { id: { in: affectedIds } },
    data: { deletedAt: now },
  });

  return { count: result.count, affectedIds };
}
