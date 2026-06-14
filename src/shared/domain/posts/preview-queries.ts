import "server-only";

import { prisma } from "@/shared/db/prisma";
import { toPlainObject } from "@/shared/lib/serialize";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

const postDetailSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  thumbnailUrl: true,
  publishedAt: true,
  contentWidth: true,
  contentWidthCustom: true,
  metaDescription: true,
  metaKeywords: true,
  ogpTitle: true,
  ogpDescription: true,
  ogpImageUrl: true,
  category: { select: { name: true, slug: true } },
  author: { select: { name: true } },
  postTags: {
    select: { tag: { select: { name: true, slug: true } } },
  },
} as const;

/**
 * Preview 用 post fetch — published filter なし (draft 含む全件)、cache なし (常に最新)。
 *
 * 公開 `getPublishedPost(slug)` と同じ select shape + `url` 付加で
 * 本番 `PostDetailPageContent` をそのまま再利用可能にする canonical 整形。
 */
export async function getPostByIdForPreview(id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    select: postDetailSelect,
  });

  if (!post) return null;

  return toPlainObject({
    ...post,
    url: buildPostCanonicalPath(post),
  });
}
