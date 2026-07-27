import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";

/**
 * cron の実行間隔（`terraform/cloud_scheduler.tf` の `blog-scheduled-publish`
 * ジョブ、既定 10 分間隔）の 2 倍を look-back window として使う。at-least-once
 * retry や単発の実行ミス（デプロイ中の瞬断等）を吸収するバッファ。
 */
export const POSTS_SCHEDULED_PUBLISH_LOOKBACK_MINUTES = 20;

/**
 * 直近 `lookbackMinutes` 分以内に `publishedAt` を迎えた公開済み（`status:
 * PUBLISHED`）ポストの slug 一覧を返す。
 *
 * `publicPostsWhere()`（`src/shared/domain/posts/queries.ts`）が
 * `publishedAt <= now` を gate することで予約公開（未来日時指定）記事の早期
 * 露出は防げるが、その query 自体は `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`
 * （"hours" プロファイル: stale 5分 / revalidate 1時間 / expire 1日）で
 * キャッシュされる。公開日時を過ぎても、次のリクエストが revalidate window
 * （既定 1 時間）を跨がない限り公開サイトには古い（＝まだ非公開扱いの）結果が
 * 返り続け得る。
 *
 * cron `/api/cron/blog-scheduled-publish` がこの関数の戻り値を使って
 * POSTS 系キャッシュタグを明示的に revalidate することで、公開日時ちょうどでの
 * 露出精度を cron 間隔単位まで保証する（詳細は該当 route の docstring 参照）。
 */
export async function findRecentlyDueScheduledPostSlugs(
  lookbackMinutes: number = POSTS_SCHEDULED_PUBLISH_LOOKBACK_MINUTES,
): Promise<string[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - lookbackMinutes * MS_PER_MINUTE);

  const posts = await prisma.post.findMany({
    where: {
      deletedAt: null,
      status: PostStatus.PUBLISHED,
      publishedAt: { lte: now, gt: windowStart },
    },
    select: { slug: true },
  });

  return posts.map((item) => item.slug);
}
