import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { CustomerStatus } from "@generated/prisma/enums";
import { CUSTOMER_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export type AffectedCustomerStatusChange = {
  id: string;
  previousStatus: CustomerStatus;
};

export type BulkSetStatusCustomersResult = {
  count: number;
  newStatus: CustomerStatus;
  affectedIds: string[];
  /** per-id audit 用 previousStatus snapshot。affectedIds と 1:1 対応。 */
  affected: ReadonlyArray<AffectedCustomerStatusChange>;
  rejectedIds: string[];
};

/**
 * 複数顧客のステータスを一括変更する。
 *
 * - 同一ステータスへの変更は no-op でスキップ
 * - CUSTOMER_STATUS_TRANSITIONS に従い遷移不可なものは rejectedIds に積む
 * - 戻り値の affectedIds は cache invalidation 用
 */
export async function bulkSetStatusCustomersCommand(
  ids: string[],
  newStatus: CustomerStatus,
): Promise<BulkSetStatusCustomersResult> {
  if (ids.length === 0) {
    return {
      count: 0,
      newStatus,
      affectedIds: [],
      affected: [],
      rejectedIds: [],
    };
  }

  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });

  const affected: AffectedCustomerStatusChange[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = CUSTOMER_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      affected.push({ id: t.id, previousStatus: t.status });
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (affected.length === 0) {
    return { count: 0, newStatus, affectedIds: [], affected: [], rejectedIds };
  }

  const result = await prisma.customer.updateMany({
    where: { id: { in: affected.map((a) => a.id) } },
    data: { status: newStatus },
  });

  return {
    count: result.count,
    newStatus,
    affectedIds: affected.map((a) => a.id),
    affected,
    rejectedIds,
  };
}
