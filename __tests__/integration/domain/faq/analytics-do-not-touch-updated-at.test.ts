/**
 * FAQ の閲覧・投票が鮮度判定を潰さないことの検証。
 *
 * == なぜ要るのか ==
 *
 * `FaqItem.updatedAt` は Prisma の `@updatedAt` なので、`updateMany` でも必ず現在時刻に
 * 書き換わる。訪問者が /faq でアコーディオンを開くと `FaqViewTracker` が
 * `POST /api/faq/[id]/view` を叩き、そこで `updatedAt` が now になっていた
 * （監査 F-51）。dedup は localStorage の 24 時間 TTL（**ブラウザ単位**）だけなので、
 * 別の訪問者が開けば再び発火する。
 *
 * `FAQ_STALE_DAYS` は 180。**180 日に 1 度でも誰かに開かれた項目は
 * `updatedAt < threshold` に永久に一致しない**。weekly の cron は常に `detected: 0` を
 * 返し、管理画面の `staleCount` と `quickFilter='stale'` も 0 件になる。
 * **内容が 3 年見直されていない人気 FAQ ほど確実に検知対象から外れる**という逆転。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。`@updatedAt` は Prisma / DB の挙動そのものなので、実 DB でしか
 * 確かめられない。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type AnalyticsModule = typeof import("@/shared/domain/faq/analytics-commands");

let prisma: PrismaModule["prisma"];
let incrementFaqItemViewCount: AnalyticsModule["incrementFaqItemViewCount"];
let voteFaqItemHelpful: AnalyticsModule["voteFaqItemHelpful"];
let detectStaleFaqItems: AnalyticsModule["detectStaleFaqItems"];

let categoryId: string;
const createdItemIds: string[] = [];

/** `updatedAt` を過去に固定した公開 FAQ 項目を作る。 */
async function createStaleItem(daysAgo: number): Promise<string> {
  const suffix = crypto.randomUUID();
  const row = await prisma.faqItem.create({
    data: {
      categoryId,
      question: `古い質問 ${suffix}`,
      answer: "回答",
      isPublished: true,
      order: createdItemIds.length + 1,
    },
    select: { id: true },
  });
  createdItemIds.push(row.id);

  // `@updatedAt` は Prisma 側で必ず now に書き換わるので、raw で過去へ倒す。
  const past = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`
    UPDATE "faq_items" SET "updated_at" = ${past} WHERE "id" = ${row.id}::uuid
  `;
  return row.id;
}

async function readUpdatedAt(id: string): Promise<Date> {
  const row = await prisma.faqItem.findUniqueOrThrow({
    where: { id },
    select: { updatedAt: true },
  });
  return row.updatedAt;
}

describeMaybe("FAQ の閲覧・投票は鮮度判定を潰さない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ incrementFaqItemViewCount, voteFaqItemHelpful, detectStaleFaqItems } =
      await import("@/shared/domain/faq/analytics-commands"));

    const category = await prisma.faqCategory.create({
      data: {
        name: `Freshness ${crypto.randomUUID()}`,
        slug: `freshness-${crypto.randomUUID()}`,
        order: 60_000_000 + Math.floor(Math.random() * 10_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.faqItem.deleteMany({ where: { id: { in: createdItemIds } } });
    await prisma.faqCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("閲覧を数えても updatedAt は動かない", async () => {
    const id = await createStaleItem(365);
    const before = await readUpdatedAt(id);

    const result = await incrementFaqItemViewCount(id);

    expect(result).toEqual({ incremented: true });
    expect((await readUpdatedAt(id)).getTime()).toBe(before.getTime());

    const row = await prisma.faqItem.findUniqueOrThrow({
      where: { id },
      select: { viewCount: true, lastViewedAt: true },
    });
    // 集計自体はちゃんと進む（閲覧時刻は専用列に残る）。
    expect(row.viewCount).toBe(1);
    expect(row.lastViewedAt).not.toBeNull();
  });

  test("投票しても updatedAt は動かない", async () => {
    const id = await createStaleItem(365);
    const before = await readUpdatedAt(id);

    expect(await voteFaqItemHelpful(id, "helpful")).toEqual({ voted: true });
    expect(await voteFaqItemHelpful(id, "not-helpful")).toEqual({
      voted: true,
    });

    expect((await readUpdatedAt(id)).getTime()).toBe(before.getTime());
    const row = await prisma.faqItem.findUniqueOrThrow({
      where: { id },
      select: { helpfulCount: true, notHelpfulCount: true },
    });
    expect(row.helpfulCount).toBe(1);
    expect(row.notHelpfulCount).toBe(1);
  });

  test("閲覧された古い項目も stale として検知される", async () => {
    const id = await createStaleItem(365);
    await incrementFaqItemViewCount(id);

    const stale = await detectStaleFaqItems(180, 100);

    // ここから消えるのが F-51。人気 FAQ ほど検知対象から外れる。
    expect(stale.map((item) => item.id)).toContain(id);
  });

  test("最近更新された項目は stale ではない", async () => {
    const id = await createStaleItem(1);

    const stale = await detectStaleFaqItems(180, 100);

    expect(stale.map((item) => item.id)).not.toContain(id);
  });

  test("非公開・削除済みは集計対象外（従来どおり）", async () => {
    const id = await createStaleItem(365);
    await prisma.faqItem.update({
      where: { id },
      data: { isPublished: false },
    });

    expect(await incrementFaqItemViewCount(id)).toEqual({ incremented: false });
    expect(await voteFaqItemHelpful(id, "helpful")).toEqual({ voted: false });
  });
});
