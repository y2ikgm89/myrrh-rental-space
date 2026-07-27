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

  // Round-5 audit Finding #6: events 側 (bulkSetStatusEventsCommand) と同型の
  // TOCTOU。旧実装は updateMany の WHERE が id のみで status を含まず、read〜write
  // 間の競合更新を無条件に上書きしていた。read 時点の status を WHERE に claim
  // として含める。加えて、claim に失敗した id を InquiryStatusHistory に書くと
  // 「実際には起きていない遷移」の偽レコードが append-only な監査証跡に残るため、
  // 実際に claim できた id だけを history 対象にする。
  const confirmedTargets = await prisma.$transaction(async (tx) => {
    const claim = await tx.inquiry.updateMany({
      where: {
        deletedAt: null,
        OR: allowedTargets.map((t) => ({ id: t.id, status: t.fromStatus })),
      },
      data: { status: newStatus },
    });

    let confirmed = allowedTargets;
    if (claim.count < allowedTargets.length) {
      const rows = await tx.inquiry.findMany({
        where: {
          id: { in: allowedTargets.map((t) => t.id) },
          status: newStatus,
        },
        select: { id: true },
      });
      const confirmedIds = new Set(rows.map((r) => r.id));
      rejectedIds.push(
        ...allowedTargets
          .filter((t) => !confirmedIds.has(t.id))
          .map((t) => t.id),
      );
      confirmed = allowedTargets.filter((t) => confirmedIds.has(t.id));
    }

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
