import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkDeleteInquiriesResult = {
  count: number;
  affectedIds: string[];
};

/**
 * 複数のお問い合わせを一括削除する。
 *
 * - hard delete（`Inquiry` に soft delete カラムなし）
 * - `Customer.inquiries` への onDelete cascade はないが Inquiry → Customer は SetNull のため衝突なし
 * - 戻り値の `affectedIds` は cache invalidation 用（削除成功分のみ）
 */
export async function bulkDeleteInquiriesCommand(
  ids: string[],
): Promise<BulkDeleteInquiriesResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedIds: [] };
  }

  const affectedIds = targets.map((t) => t.id);
  const result = await prisma.inquiry.deleteMany({
    where: { id: { in: affectedIds } },
  });

  return { count: result.count, affectedIds };
}
