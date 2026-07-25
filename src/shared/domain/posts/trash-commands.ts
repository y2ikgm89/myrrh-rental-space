import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { MS_PER_DAY } from "@/shared/lib/date-format";

/**
 * 保持期間を過ぎたソフトデリート済み投稿を完全削除する。
 *
 * FAQ `permanentlyDeleteExpiredFaqTrash` と同型。cron から呼ぶ想定。
 */
export async function permanentlyDeleteExpiredPostTrash(
  retentionDays: number,
): Promise<{ deleted: number }> {
  if (retentionDays < 0) {
    throw new DomainError(
      "retentionDays は 0 以上でなければなりません",
      "VALIDATION",
    );
  }
  const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);
  const result = await prisma.post.deleteMany({
    where: { deletedAt: { not: null, lt: threshold } },
  });
  return { deleted: result.count };
}
