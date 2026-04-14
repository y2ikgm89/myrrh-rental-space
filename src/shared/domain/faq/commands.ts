import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

// ============================================================================
// Analytics: viewCount increment
// ============================================================================

/**
 * FAQ 項目の viewCount をアトミックに increment
 * 公開中かつ未削除の項目のみ対象。存在しない ID は silent skip（spam 防止）。
 * Zendesk / HubSpot KB 方式: 集計値のみ、個人データは保存しない。
 */
export async function incrementFaqItemViewCount(
  id: string,
): Promise<{ incremented: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });
  return { incremented: result.count > 0 };
}

/**
 * 長期間更新されていない公開中 FAQ 項目（stale）を検出
 * 閾値日数以上 updatedAt が古い項目を新しい順に返す。
 */
export async function detectStaleFaqItems(
  staleDays: number,
  limit = 20,
): Promise<ReadonlyArray<{ id: string; question: string; updatedAt: Date }>> {
  if (staleDays < 1) {
    throw new DomainError(
      "staleDays は 1 以上でなければなりません",
      "VALIDATION",
    );
  }
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  return prisma.faqItem.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      updatedAt: { lt: threshold },
    },
    select: { id: true, question: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

/**
 * FAQ 項目の helpful 投票をアトミックに increment
 * 公開中かつ未削除の項目のみ対象。存在しない ID は silent skip。
 */
export async function voteFaqItemHelpful(
  id: string,
  vote: "helpful" | "not-helpful",
): Promise<{ voted: boolean }> {
  const result = await prisma.faqItem.updateMany({
    where: { id, isPublished: true, deletedAt: null },
    data:
      vote === "helpful"
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
  });
  return { voted: result.count > 0 };
}

// ============================================================================
// Cron cleanup: 30 日経過したソフトデリート済み項目を完全削除
// ============================================================================

/**
 * Recycle bin 自動パージ
 * `deletedAt` が指定日数以前のソフトデリート済みカテゴリ・質問を完全削除する。
 * Cascade で親カテゴリ配下の質問も削除される。
 * idempotent（再実行しても副作用なし）。
 */
export async function permanentlyDeleteExpiredFaqTrash(
  retentionDays: number,
): Promise<{ categoriesDeleted: number; itemsDeleted: number }> {
  if (retentionDays < 0) {
    throw new DomainError(
      "retentionDays は 0 以上でなければなりません",
      "VALIDATION",
    );
  }

  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // 先に孤児アイテム（親が生きていても item 自体が古い deletedAt）を削除
  // ※ 親カテゴリが同時に期限切れなら Cascade で削除されるが、
  //   親が復元されたまま子だけ期限切れのケースは手動削除が必要
  const itemsResult = await prisma.faqItem.deleteMany({
    where: {
      deletedAt: { not: null, lt: threshold },
    },
  });

  // 次にカテゴリを削除（Cascade で配下 item も削除）
  const categoriesResult = await prisma.faqCategory.deleteMany({
    where: {
      deletedAt: { not: null, lt: threshold },
    },
  });

  return {
    categoriesDeleted: categoriesResult.count,
    itemsDeleted: itemsResult.count,
  };
}
