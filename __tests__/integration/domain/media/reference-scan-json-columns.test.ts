/**
 * `findMediaUrlUsages` が **JSONB 列に埋まった URL** を実際に見つけることを、
 * 行を入れてから引く形で固定する。
 *
 * ## なぜ
 *
 * 元の実装は JSONB 列を Prisma の `string_contains` で走査していた。これが生成する
 * SQL は `col::text LIKE '%…%' AND JSONB_TYPEOF(col) = 'string'` で、対象 9 列すべてに
 * `jsonb_typeof(col) = 'object' | 'array'` の CHECK があるため**恒偽**だった
 * （`prisma/baseline/invariants.sql`）。つまり検査は一度も成立しておらず、
 * `deleteMediaCommand` は使用中の画像を素通りさせて R2 の実体をハード削除していた。
 * Cloudflare R2 にオブジェクトバージョニングは無いので復旧できない。
 *
 * 実損が出るのは HTML のミラー列を持たない 4 列:
 * `sections.config` / `spaces.gallery` / `events.gallery` / `locations.image_urls`。
 * 中でも `sections.config` は全公開ページのセクション画像を握っている。
 *
 * ## 何を見るか
 *
 * **実 Postgres に判定させる**。既存の `__tests__/unit/domain/media/references.test.ts` は
 * Prisma を差し替えて `findFirst` の戻り値を注入するだけなので、`where` 節の意味は
 * 一度も実行されない — この欠陥は原理的に見えない。
 *
 * 各テストは対象列にだけ URL を入れる。exact 一致列（`mainImageUrl` /
 * `imageUrl` / `thumbnailUrl`）や HTML 列には入れない。入れると別経路で
 * 拾えてしまい、JSON 走査が壊れていても緑になる。
 *
 * ## 直し方
 *
 * 落ちたら `findJsonColumnUsages`（`src/shared/domain/media/references.ts`）の生 SQL が
 * 実スキーマとずれている（テーブル名・列名の変更、ソフト削除条件の追加）。
 * **`string_contains` に戻さない。** 戻した瞬間に検査全体が恒偽へ戻る。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type ReferencesModule = typeof import("@/shared/domain/media/references");

let prisma: PrismaModule["prisma"];
let findMediaUrlUsages: ReferencesModule["findMediaUrlUsages"];

let nextSortOrder = 1_800_000_000;

/** MediaPicker が入れる形の URL。`_` を含めて LIKE エスケープも通す。 */
function probeUrl(): string {
  return `https://cdn.example.com/media/general/probe_${crypto.randomUUID()}.jpg`;
}

const cleanups: (() => Promise<void>)[] = [];

async function createLocation(imageUrls: unknown): Promise<string> {
  const suffix = crypto.randomUUID();
  const location = await prisma.location.create({
    data: {
      slug: `media-ref-loc-${suffix}`,
      name: `Media Ref Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      // exact 一致列には probe URL を入れない（別経路で拾えてしまう）。
      imageUrl: "https://example.com/unrelated.jpg",
      imageUrls: imageUrls as never,
      sortOrder: nextSortOrder++,
    },
    select: { id: true, name: true },
  });
  cleanups.push(async () => {
    await prisma.location.deleteMany({ where: { id: location.id } });
  });
  return location.name;
}

describeMaybe("findMediaUrlUsages — JSONB 列の走査", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ findMediaUrlUsages } = await import("@/shared/domain/media/references"));
  });

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
    await prisma.$disconnect();
  });

  test("sections.config（object 根）に埋まった URL を見つける", async () => {
    const url = probeUrl();
    const suffix = crypto.randomUUID();

    const page = await prisma.page.create({
      data: {
        slug: `media-ref-page-${suffix}`,
        title: `Media Ref Page ${suffix}`,
        template: "CUSTOM",
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        pageId: page.id,
        type: "page-hero",
        order: 0,
        // page-hero の背景画像。URL は variant 依存で深さが変わるので、
        // path 指定では捕まえられないことを示す形にしてある。
        config: { variant: "media", images: [{ url, alt: "" }] },
      },
      select: { id: true },
    });
    cleanups.push(async () => {
      await prisma.section.deleteMany({ where: { id: section.id } });
      await prisma.page.deleteMany({ where: { id: page.id } });
    });

    expect(await findMediaUrlUsages(url)).toContain("セクション");
  });

  test("locations.image_urls（array 根）に埋まった URL を見つける", async () => {
    const url = probeUrl();
    const name = await createLocation([url]);

    expect(await findMediaUrlUsages(url)).toContain(`会場: ${name}`);
  });

  test("spaces.gallery（オブジェクト要素の array）に埋まった URL を見つける", async () => {
    const url = probeUrl();
    const suffix = crypto.randomUUID();

    const location = await prisma.location.create({
      data: {
        slug: `media-ref-space-loc-${suffix}`,
        name: `Media Ref Space Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/unrelated.jpg",
        sortOrder: nextSortOrder++,
      },
      select: { id: true },
    });
    const space = await prisma.space.create({
      data: {
        slug: `media-ref-space-${suffix}`,
        name: `Media Ref Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 10,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/unrelated.jpg",
        locationId: location.id,
        // gallery の要素は文字列ではなくオブジェクト。だから `array_contains` でも
        // URL 単体では当たらない。
        gallery: [{ url, alt: "" }],
      },
      select: { id: true, name: true },
    });
    cleanups.push(async () => {
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    });

    expect(await findMediaUrlUsages(url)).toContain(`スペース: ${space.name}`);
  });

  test("無関係な URL では何も返さない（走査が広すぎない）", async () => {
    // 直前のテストが入れた行が残っている状態で、別 URL が拾われないことを見る。
    // これが無いと「常に全件ヒットする LIKE」でも上の 3 本が緑になる。
    expect(await findMediaUrlUsages(probeUrl())).toEqual([]);
  });

  test("LIKE のメタ文字を含む URL が他のメディアに誤一致しない", async () => {
    // 保存されているのは `probeX…`。検索するのは同じ位置が `_` の別 URL。
    // `_` は LIKE の「任意の 1 文字」なので、エスケープしていないと
    // **別メディアを「使用中」と誤判定して削除できなくする**。
    const stored = probeUrl().replace("probe_", "probeX");
    const name = await createLocation([stored]);
    expect(await findMediaUrlUsages(stored)).toContain(`会場: ${name}`);

    const wildcarded = stored.replace("probeX", "probe_");
    expect(await findMediaUrlUsages(wildcarded)).toEqual([]);
  });
});
