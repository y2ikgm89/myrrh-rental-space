import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkToggleActiveCouponsResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCouponsResult = {
  count: number;
  affectedIds: string[];
};

/**
 * 複数クーポンの有効/無効を一括切替する。
 *
 * - `isActive` を一括設定
 * - 戻り値の `affectedIds` は cache invalidation 用
 */
export async function bulkToggleActiveCouponsCommand(
  ids: string[],
  isActive: boolean,
): Promise<BulkToggleActiveCouponsResult> {
  if (ids.length === 0) {
    return { count: 0, isActive, affectedIds: [] };
  }
  const targets = await prisma.coupon.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, isActive, affectedIds: [] };
  }
  const result = await prisma.coupon.updateMany({
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
 * 複数クーポンを一括削除する。
 *
 * - `Reservation.couponId` は `onDelete: SetNull` のため FK 衝突なし
 * - `Coupon.usageCount > 0` でも削除可能（過去予約には影響しない）
 */
export async function bulkDeleteCouponsCommand(
  ids: string[],
): Promise<BulkDeleteCouponsResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const targets = await prisma.coupon.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedIds: [] };
  }
  const result = await prisma.coupon.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return {
    count: result.count,
    affectedIds: targets.map((t) => t.id),
  };
}
