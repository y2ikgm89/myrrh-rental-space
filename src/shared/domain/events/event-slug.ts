import "server-only";

import { prisma } from "@/shared/db/prisma";
import { truncateSlug } from "@/shared/lib/text/bounded-append";
import { EVENT_SLUG_BASE_MAX_LENGTH } from "@/shared/lib/validations/event-limits";

/**
 * `slug` が空いていればそのまま返し、衝突したら `${slug}-2`, `${slug}-3` ...
 * の最小未使用番号を返す（WordPress / Ghost / Notion 互換のインクリメンタル方式）。
 *
 * deterministic な番号付けにより、複製イベントの URL が「（コピー）」「（コピー）-2」
 * のように人間に予測可能な並びになる。
 *
 * ## 連番ぶんの余地を先に作る
 *
 * `events.slug` は VarChar(100)。上限いっぱいの slug が衝突すると `-2` を足した
 * 時点で 101 文字になり、**22001 で落ちる**（`DomainError` ではないので 500）。
 * 衝突が起きたときだけベースを `EVENT_SLUG_BASE_MAX_LENGTH` まで詰めてから採番する。
 *
 * 詰めるのは衝突時だけなので、通常の作成・更新（Zod が 100 で止めている）は
 * 入力どおりの slug がそのまま保存される。
 */
export async function ensureUniqueSlug(
  requested: string,
  excludeId?: string,
): Promise<string> {
  const existing = await prisma.event.findFirst({
    where: {
      slug: requested,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (!existing) return requested;

  // 連番を足しても列に収まる長さへ。**探す前に詰める** — 詰めた後に探さないと、
  // 「空いていると判定した slug」と「実際に保存する slug」が別物になる。
  const slug = truncateSlug(requested, EVENT_SLUG_BASE_MAX_LENGTH);

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
