import "server-only";

import { prisma } from "@/shared/db/prisma";
import { toPlainObject } from "@/shared/lib/serialize";

const termsDetailSelect = {
  id: true,
  slug: true,
  title: true,
  contentHtml: true,
  publishedAt: true,
} as const;

/**
 * Preview 用 terms fetch — published filter なし (draft 含む全件)、cache なし (常に最新)。
 *
 * 公開 `getPublicTermsBySlug(slug)` と同じ表示フィールド + `url` 付加で
 * 本番 `TermsDetailPageContent` をそのまま再利用可能にする canonical 整形。
 */
export async function getTermsByIdForPreview(id: string) {
  const item = await prisma.termsDocument.findUnique({
    where: { id },
    select: termsDetailSelect,
  });

  if (!item) return null;

  return toPlainObject({
    ...item,
    url: `/terms/${item.slug}`,
  });
}
