import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkToggleActiveCustomersResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCustomersResult = {
  count: number;
  affectedIds: string[];
};

/**
 * 複数顧客の有効/無効を一括切替する。
 *
 * - `isActive: true` で有効化、`false` で無効化
 * - 戻り値の `affectedIds` は cache invalidation 用
 */
export async function bulkToggleActiveCustomersCommand(
  ids: string[],
  isActive: boolean,
): Promise<BulkToggleActiveCustomersResult> {
  if (ids.length === 0) {
    return { count: 0, isActive, affectedIds: [] };
  }
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, isActive, affectedIds: [] };
  }
  const result = await prisma.customer.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isActive },
  });
  return {
    count: result.count,
    isActive,
    affectedIds: targets.map((t) => t.id),
  };
}

/**
 * 複数顧客を一括削除する。
 *
 * - `Reservation.customerId` / `Inquiry.customerId` 等は `onDelete: SetNull` で FK 衝突なし
 * - 戻り値の `affectedIds` は cache invalidation 用
 */
export async function bulkDeleteCustomersCommand(
  ids: string[],
): Promise<BulkDeleteCustomersResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const result = await prisma.customer.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return {
    count: result.count,
    affectedIds: targets.map((t) => t.id),
  };
}
