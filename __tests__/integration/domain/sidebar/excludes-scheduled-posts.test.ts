/**
 * サイドバーが予約公開（未来 publishedAt）の記事を出さないことの検証。
 *
 * == なぜ要るのか ==
 *
 * 管理画面は `status=PUBLISHED` + 未来 `publishedAt` を正規の予約公開手順として
 * 受け付ける（`blog-scheduled-publish` cron の docstring が明記）。
 * `/blog` 一覧・詳細・feed.xml・sitemap は `publicPostsWhere()` の
 * `publishedAt <= now` で正しく伏せるが、サイドバーだけがこの helper を使わず
 * `status` しか見ていなかった（監査 F-66）。
 *
 * recent ウィジェットは `publishedAt: desc` なので、**未来日時の記事が必ず先頭に
 * 出る**。公開日の何日も前からタイトル・サムネイル・カテゴリが全ブログ系ページに
 * 露出し、クリックすると `getPublishedPost` が null を返して 404 になる。
 * categories の postCount と tags も同じ where を共有していた。
 *
 * == 実 DB を使う理由 ==
 *
 * 欠陥は「query が何行返すか」。where 句を mock に写経しても、`publishedAt` の
 * 比較が実際に効くかは分からない。行を書いて query を通す。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type SidebarModule = typeof import("@/shared/domain/sidebar/queries");
type SidebarWidget = import("@/shared/lib/validations/sidebar").SidebarWidget;

let prisma: PrismaModule["prisma"];
let getSidebarData: SidebarModule["getSidebarData"];

const WIDGETS: SidebarWidget[] = [
  { type: "recent", enabled: true, layout: "compact" },
  { type: "popular", enabled: true, layout: "compact", showRanking: true },
  { type: "categories", enabled: true },
  { type: "tags", enabled: true },
];

type Fixture = {
  publishedTitle: string;
  scheduledTitle: string;
  cleanup: () => Promise<void>;
};

// `PostCategory.order` は `@@unique`。既定値 0 のままだと seed 済みカテゴリと衝突する。
let nextCategoryOrder = 900_000 + Math.floor(Math.random() * 10_000);

async function createPostFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const category = await prisma.postCategory.create({
    data: {
      name: `Sidebar Cat ${suffix}`,
      slug: `sidebar-cat-${suffix}`,
      order: nextCategoryOrder++,
    },
    select: { id: true },
  });

  const publishedTitle = `公開済み ${suffix}`;
  const scheduledTitle = `予約公開 ${suffix}`;

  const base = {
    excerpt: "test",
    contentHtml: "<p>test</p>",
    thumbnailUrl: "https://example.com/thumb.jpg",
    categoryId: category.id,
    status: "PUBLISHED" as const,
  };

  const published = await prisma.post.create({
    data: {
      ...base,
      title: publishedTitle,
      slug: `sidebar-published-${suffix}`,
      publishedAt: new Date("2020-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  // 未来日時 = 予約公開。ここが漏れると recent の先頭に出る。
  const scheduled = await prisma.post.create({
    data: {
      ...base,
      title: scheduledTitle,
      slug: `sidebar-scheduled-${suffix}`,
      publishedAt: new Date("2099-01-01T00:00:00Z"),
      viewCount: 999_999,
    },
    select: { id: true },
  });

  return {
    publishedTitle,
    scheduledTitle,
    cleanup: async () => {
      await prisma.post.deleteMany({
        where: { id: { in: [published.id, scheduled.id] } },
      });
      await prisma.postCategory.deleteMany({ where: { id: category.id } });
    },
  };
}

describeMaybe("サイドバーは予約公開の記事を出さない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getSidebarData } = await import("@/shared/domain/sidebar/queries"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("recent / popular に未来 publishedAt の記事が現れない", async () => {
    const { publishedTitle, scheduledTitle, cleanup } =
      await createPostFixture();

    try {
      const data = await getSidebarData(WIDGETS, 50, 50);

      const recentTitles = data.recentPosts.map((p) => p.title);
      const popularTitles = data.popularPosts.map((p) => p.title);

      expect(recentTitles).toContain(publishedTitle);
      // `publishedAt: desc` なので、漏れていれば必ず先頭に来る。
      expect(recentTitles).not.toContain(scheduledTitle);
      // viewCount を大きくしてあるので、漏れていれば popular の先頭に来る。
      expect(popularTitles).not.toContain(scheduledTitle);
    } finally {
      await cleanup();
    }
  });

  test("categories の postCount が予約公開分を数えない", async () => {
    const { cleanup } = await createPostFixture();

    try {
      const data = await getSidebarData(WIDGETS, 50, 50);
      const category = data.categories.find((c) =>
        c.slug.startsWith("sidebar-cat-"),
      );

      expect(category).toBeDefined();
      expect(category?.postCount).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
