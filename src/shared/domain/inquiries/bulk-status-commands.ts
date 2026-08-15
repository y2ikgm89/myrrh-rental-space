import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";
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

  // Round-5 audit Finding #6 / F-122: events 側 (bulkSetStatusEventsCommand)
  // と同型の TOCTOU。read 時点の status を WHERE に claim として含め、
  // updateManyAndReturn が返した id だけを confirmed にする。
  // 「今 newStatus になっている行」を引き直すフォールバックは、並行相手の
  // 同一ステータス書き込みを自分の成果と誤認するため使わない。
  const confirmedTargets = await prisma.$transaction(async (tx) => {
    const claimed = await tx.inquiry.updateManyAndReturn({
      where: {
        deletedAt: null,
        OR: allowedTargets.map((t) => ({ id: t.id, status: t.fromStatus })),
      },
      data: { status: newStatus },
      select: { id: true },
    });

    const confirmedIds = new Set(claimed.map((r) => r.id));
    rejectedIds.push(
      ...allowedTargets.filter((t) => !confirmedIds.has(t.id)).map((t) => t.id),
    );
    const confirmed = allowedTargets.filter((t) => confirmedIds.has(t.id));

    if (confirmed.length > 0) {
      await tx.inquiryStatusHistory.createMany({
        data: confirmed.map((t) => ({
          inquiryId: t.id,
          fromStatus: t.fromStatus,
          toStatus: newStatus,
          changedById,
          reason: reason ?? null,
        })),
      });
    }

    return confirmed;
  });

  return {
    count: confirmedTargets.length,
    newStatus,
    affectedIds: confirmedTargets.map((t) => t.id),
    rejectedIds,
  };
}
