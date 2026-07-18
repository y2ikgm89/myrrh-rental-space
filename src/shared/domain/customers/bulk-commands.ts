import "server-only";

import { prisma } from "@/shared/db/prisma";
import { isDomainError } from "@/shared/domain/domain-error";
import {
  anonymizeCustomerCommand,
  type AnonymizeCustomerReason,
} from "@/shared/domain/customers/commands";

export type BulkToggleActiveCustomersResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkAnonymizeCustomersResult = {
  count: number;
  affectedIds: string[];
  /** 既に anonymized 済みで skip した ID (冪等的成功扱い、error にしない)。 */
  skippedIds: string[];
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
 * 複数顧客を一括匿名化する (STATE-03)。
 *
 * `Reservation.customer` は `onDelete: Cascade`、`Receipt.reservation` は
 * `onDelete: Restrict` のため、決済歴 (Receipt 発行済) のある顧客は物理削除できない。
 * 物理削除の代わりに `anonymizeCustomerCommand` を各 ID に対して逐次適用し、
 * PII を placeholder に置換 + Better Auth User を削除する。
 *
 * - 既に anonymized 済みの ID は `skippedIds` に含めて成功扱い (冪等性)
 * - 途中で失敗した場合は throw (呼び出し側が MutationError に変換)
 * - 各 anonymize は独立 transaction (途中失敗しても既完了分は反映済み)
 * - 戻り値の `affectedIds` は cache invalidation 用
 */
export async function bulkAnonymizeCustomersCommand(
  ids: string[],
  reason: AnonymizeCustomerReason,
): Promise<BulkAnonymizeCustomersResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [], skippedIds: [] };
  }

  const affectedIds: string[] = [];
  const skippedIds: string[] = [];

  for (const id of ids) {
    try {
      const result = await anonymizeCustomerCommand({
        customerId: id,
        reason,
      });
      affectedIds.push(result.customerId);
    } catch (error) {
      // 「既に匿名化済み」= 冪等的成功として扱う (bulk 操作の再実行安全性)。
      // それ以外の error (NOT_FOUND / DB エラー) はそのまま伝播する。
      if (isDomainError(error) && error.code === "CONFLICT") {
        skippedIds.push(id);
        continue;
      }
      throw error;
    }
  }

  return {
    count: affectedIds.length,
    affectedIds,
    skippedIds,
  };
}
