import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { EventStatus } from "@generated/prisma/enums";
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

  // Round-5 audit Finding #5: 旧実装は updateMany の WHERE が id のみで
  // status を含んでおらず、上の findMany で読んだ後・この書込までの間に
  // 別 admin が対象イベントのステータスを変更していても無条件に newStatus で
  // 上書きしていた (TOCTOU)。read 時点の status を WHERE に claim として含め、
  // read〜write 間に状態が変わった行は自然に更新対象から外れるようにする
  // (reservation の updateReservationStatusCommand と同型の claim パターン)。
  const claim = await prisma.event.updateMany({
    where: {
      deletedAt: null,
      OR: allowedTargets.map((t) => ({ id: t.id, status: t.fromStatus })),
    },
    data: { status: newStatus },
  });

  let affectedIds = allowedTargets.map((t) => t.id);

  if (claim.count < allowedTargets.length) {
    // 一部が claim に失敗した (他 admin による競合更新)。実際に newStatus へ
    // 遷移できた id だけを affectedIds として返す (呼び出し元はこれを使って
    // CANCELLED 通知メールを送るため、競合で実際は変更されていないイベントに
    // 誤送信しないようにする)。
    const confirmed = await prisma.event.findMany({
      where: { id: { in: affectedIds }, status: newStatus },
      select: { id: true },
    });
    const confirmedIds = new Set(confirmed.map((c) => c.id));
    rejectedIds.push(...affectedIds.filter((id) => !confirmedIds.has(id)));
    affectedIds = affectedIds.filter((id) => confirmedIds.has(id));
  }

  return {
    count: affectedIds.length,
    newStatus,
    affectedIds,
    rejectedIds,
  };
}
