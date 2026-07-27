import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * `slug` が空いていればそのまま返し、衝突したら `${slug}-2`, `${slug}-3` ...
 * の最小未使用番号を返す（WordPress / Ghost / Notion 互換のインクリメンタル方式）。
 *
 * deterministic な番号付けにより、複製イベントの URL が「（コピー）」「（コピー）-2」
 * のように人間に予測可能な並びになる。
 */
export async function ensureUniqueSlug(
  slug: string,
  excludeId?: string,
): Promise<string> {
  const existing = await prisma.event.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (!existing) return slug;

  const siblings = await prisma.event.findMany({
    where: {
      slug: { startsWith: `${slug}-` },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const used = new Set<number>();
  for (const s of siblings) {
    const match = s.slug.match(pattern);
    if (match?.[1]) used.add(Number(match[1]));
  }

  let n = 2;
  while (used.has(n)) n++;
  return `${slug}-${n}`;
}
