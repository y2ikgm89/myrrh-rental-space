import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { MS_PER_DAY } from "@/shared/lib/date-format";

/*
 * FAQ-FRESHNESS-01: 閲覧・投票の集計は **`updated_at` を触らない**（監査 F-51）。
 *
 * `FaqItem.updatedAt` は Prisma の `@updatedAt` なので、`updateMany` でも必ず現在時刻に
 * 書き換わる。訪問者が /faq でアコーディオンを開くと `FaqViewTracker` が
 * `POST /api/faq/[id]/view` を叩き、そこで `updated_at` が now になる。dedup は
 * localStorage の 24 時間 TTL（**ブラウザ単位**）だけなので、別の訪問者が開けば再び
 * 発火する。
 *
 * `FAQ_STALE_DAYS` は 180 なので、**180 日に 1 度でも誰かに開かれた項目は
 * `updatedAt < threshold` に永久に一致しない**。weekly の
 * `/api/cron/faq-stale-check` は常に `detected: 0` を返し、管理画面の
 * `staleCount` と `quickFilter='stale'` も 0 件になる。
 * **内容が 3 年見直されていない人気 FAQ ほど確実に検知対象から外れる**という逆転が
 * 起きていた。
 *
 * 閲覧回数・投票数は集計値であって「管理者が内容を直した」ことではない。
 * `@updatedAt` を迂回するため raw SQL で書く（Prisma には列単位で `@updatedAt` を
 * 無効化する手段が無い）。閲覧時刻は専用列 `last_viewed_at` に残るので情報は失わない。
 */

export async function incrementFaqItemViewCount(
  id: string,
): Promise<{ incremented: boolean }> {
  const affected = await prisma.$executeRaw`
    UPDATE "faq_items"
    SET "view_count" = "view_count" + 1,
        "last_viewed_at" = NOW()
    WHERE "id" = ${id}::uuid
      AND "is_published" = TRUE
      AND "deleted_at" IS NULL
  `;
  return { incremented: affected > 0 };
}

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
  const threshold = new Date(Date.now() - staleDays * MS_PER_DAY);
  return prisma.faqItem.findMany({
    where: { isPublished: true, deletedAt: null, updatedAt: { lt: threshold } },
    select: { id: true, question: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

export async function voteFaqItemHelpful(
  id: string,
  vote: "helpful" | "not-helpful",
): Promise<{ voted: boolean }> {
  // FAQ-FRESHNESS-01: 投票も `updated_at` を触らない。
  const affected =
    vote === "helpful"
      ? await prisma.$executeRaw`
          UPDATE "faq_items"
          SET "helpful_count" = "helpful_count" + 1
          WHERE "id" = ${id}::uuid
            AND "is_published" = TRUE
            AND "deleted_at" IS NULL
        `
      : await prisma.$executeRaw`
          UPDATE "faq_items"
          SET "not_helpful_count" = "not_helpful_count" + 1
          WHERE "id" = ${id}::uuid
            AND "is_published" = TRUE
            AND "deleted_at" IS NULL
        `;
  return { voted: affected > 0 };
}

export async function permanentlyDeleteExpiredFaqTrash(
  retentionDays: number,
): Promise<{ categoriesDeleted: number; itemsDeleted: number }> {
  if (retentionDays < 0) {
    throw new DomainError(
      "retentionDays は 0 以上でなければなりません",
      "VALIDATION",
    );
  }
  const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);
  const itemsResult = await prisma.faqItem.deleteMany({
    where: { deletedAt: { not: null, lt: threshold } },
  });
  const categoriesResult = await prisma.faqCategory.deleteMany({
    where: { deletedAt: { not: null, lt: threshold } },
  });
  return {
    categoriesDeleted: categoriesResult.count,
    itemsDeleted: itemsResult.count,
  };
}
