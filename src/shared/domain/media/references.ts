import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

const USAGE_LABEL_CAP = 5;

/**
 * メディア URL の参照先を人間可読ラベルで返す（最大 5 件）。
 * 文字列列は exact match、HTML / JSON は contains（`string_contains`）で走査する。
 */
export async function findMediaUrlUsages(url: string): Promise<string[]> {
  if (url.length === 0) return [];

  const [
    postExact,
    postContent,
    newsExact,
    newsContent,
    spaceExact,
    spaceContent,
    eventExact,
    eventContent,
    section,
    seo,
    terms,
  ] = await Promise.all([
    prisma.post.findFirst({
      where: {
        OR: [{ thumbnailUrl: url }, { ogpImageUrl: url }],
      },
      select: { slug: true },
    }),
    prisma.post.findFirst({
      where: {
        OR: [
          { contentHtml: { contains: url } },
          { contentJson: { string_contains: url } },
        ],
      },
      select: { slug: true },
    }),
    prisma.news.findFirst({
      where: { ogpImageUrl: url },
      select: { slug: true },
    }),
    prisma.news.findFirst({
      where: {
        OR: [
          { contentHtml: { contains: url } },
          { contentJson: { string_contains: url } },
        ],
      },
      select: { slug: true },
    }),
    prisma.space.findFirst({
      where: {
        OR: [{ mainImageUrl: url }, { ogpImageUrl: url }],
      },
      select: { name: true },
    }),
    prisma.space.findFirst({
      where: {
        OR: [
          { descriptionHtml: { contains: url } },
          { gallery: { string_contains: url } },
        ],
      },
      select: { name: true },
    }),
    prisma.event.findFirst({
      where: {
        deletedAt: null,
        OR: [{ thumbnailUrl: url }, { ogpImageUrl: url }],
      },
      select: { title: true },
    }),
    prisma.event.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { descriptionHtml: { contains: url } },
          { gallery: { string_contains: url } },
        ],
      },
      select: { title: true },
    }),
    prisma.section.findFirst({
      where: { config: { string_contains: url } },
      select: { id: true },
    }),
    prisma.settingsSeo.findFirst({
      where: {
        OR: [
          { headerLogoUrl: url },
          { footerLogoUrl: url },
          { faviconUrl: url },
          { defaultOgpImageUrl: url },
        ],
      },
      select: { id: true },
    }),
    prisma.termsDocument.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { contentHtml: { contains: url } },
          { contentJson: { string_contains: url } },
        ],
      },
      select: { slug: true },
    }),
  ]);

  const labels: string[] = [];
  const add = (label: string): void => {
    if (labels.length >= USAGE_LABEL_CAP) return;
    if (!labels.includes(label)) {
      labels.push(label);
    }
  };

  if (postExact) add(`投稿: ${postExact.slug}`);
  if (postContent && postContent.slug !== postExact?.slug) {
    add(`投稿: ${postContent.slug}`);
  }
  if (newsExact) add(`お知らせ: ${newsExact.slug}`);
  if (newsContent && newsContent.slug !== newsExact?.slug) {
    add(`お知らせ: ${newsContent.slug}`);
  }
  if (spaceExact) add(`スペース: ${spaceExact.name}`);
  if (spaceContent && spaceContent.name !== spaceExact?.name) {
    add(`スペース: ${spaceContent.name}`);
  }
  if (eventExact) add(`イベント: ${eventExact.title}`);
  if (eventContent && eventContent.title !== eventExact?.title) {
    add(`イベント: ${eventContent.title}`);
  }
  if (section) add("セクション");
  if (seo) add("サイト設定 (SEO)");
  if (terms) add(`規約: ${terms.slug}`);

  return labels.slice(0, USAGE_LABEL_CAP);
}

export async function assertMediaUrlNotInUse(url: string): Promise<void> {
  const usages = await findMediaUrlUsages(url);
  if (usages.length === 0) return;

  const summary = usages.join("、");
  throw new DomainError(
    `このメディアは使用中のため削除できません（${summary}）`,
    "CONFLICT",
  );
}
