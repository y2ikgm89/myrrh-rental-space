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

  const allowedTargets: AffectedCustomerStatusChange[] = [];
  const rejectedIds: string[] = [];

  for (const t of targets) {
    if (t.status === newStatus) continue;
    const allowed = CUSTOMER_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) {
      allowedTargets.push({ id: t.id, previousStatus: t.status });
    } else {
      rejectedIds.push(t.id);
    }
  }

  if (allowedTargets.length === 0) {
    return { count: 0, newStatus, affectedIds: [], affected: [], rejectedIds };
  }

  // Round-5 audit Finding #5/#6 (events/inquiries) と同じ TOCTOU が customer 側にも
  // 存在した。旧実装は updateMany の WHERE が id のみで status を含まず、read〜write
  // 間の競合更新を無条件に上書きしていた。read 時点の status を WHERE に claim として
  // 含める。claim に失敗した id を `affected`（audit ログの oldValue/newValue の元）
  // に残すと実際には起きていない遷移を AuditLog に書いてしまうため、実際に claim
  // できた id だけを返す。
  const claim = await prisma.customer.updateMany({
    where: {
      OR: allowedTargets.map((t) => ({ id: t.id, status: t.previousStatus })),
    },
    data: { status: newStatus },
  });

  let affected = allowedTargets;

  if (claim.count < allowedTargets.length) {
    const confirmed = await prisma.customer.findMany({
      where: {
        id: { in: allowedTargets.map((t) => t.id) },
        status: newStatus,
      },
      select: { id: true },
    });
    const confirmedIds = new Set(confirmed.map((c) => c.id));
    rejectedIds.push(
      ...allowedTargets.filter((t) => !confirmedIds.has(t.id)).map((t) => t.id),
    );
    affected = allowedTargets.filter((t) => confirmedIds.has(t.id));
  }

  return {
    count: affected.length,
    newStatus,
    affectedIds: affected.map((a) => a.id),
    affected,
    rejectedIds,
  };
}
