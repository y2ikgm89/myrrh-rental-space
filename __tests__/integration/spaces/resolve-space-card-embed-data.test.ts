/**
 * resolveSpaceCardEmbedData の統合テスト（実 DB 必須）。
 *
 * src/shared/domain/spaces/public-queries.ts の resolveSpaceCardEmbedData を検証する。
 * 関数内の PUBLIC_WHERE (isPublished: true, isActive: true) gate が実際に機能し、
 * 非公開・非アクティブなスペースが結果から除外されることを確認する。
 * 既存の unit test (`__tests__/unit/domain/spaces/resolve-space-card-embeds.test.ts`) は
 * 関数全体を mock しているため、実 DB 実行による gate 検証は本ファイルで行う。
 *
 * fixture 作成・cleanup は describe 直下の beforeEach/afterEach ではなく
 * **各 test 内の try/finally** に厳密に閉じ込める
 * （rate-plan-commands.test.ts と同型）。理由: beforeEach 例外時に共有 let が undefined のまま
 * afterEach に渡り、Prisma の deleteMany({ where: { id: undefined } }) が where 条件を無視して
 * テーブル全体を削除する public 仕様のため（実装初期の事故実績あり）。
 *
 * Location の sortOrder には isActive: true 時のみ有効な部分 unique index があるため、
 * fixture は isActive: false で作成し衝突を回避する
 * （rate-plan-commands.test.ts と同じ回避策）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// resolveSpaceCardEmbedData → resolve-space-card-embeds.tsx が呼ぶ `cacheTag` は
// Server Action コンテキスト外で throw するため no-op mock する
// （import より前に配置。mock.module() は宣言後の動的 import にのみ適用される）。
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// resolveSpaceCardEmbedData が isFeatureEnabled("spaces") を呼ぶため、feature module
// gate を mock で常に ON にする（registration-overbooking.test.ts と同じパターン）。
// Settings singleton との競合回避。
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mock(() => Promise.resolve(true)),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PublicQueriesModule =
  typeof import("@/shared/domain/spaces/public-queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let resolveSpaceCardEmbedData: PublicQueriesModule["resolveSpaceCardEmbedData"];

type SpaceFixture = {
  spaceId: string;
  locationId: string;
  cleanup: () => Promise<void>;
};

/** Location → Space を 1 件ずつ作る最小 fixture（resolveSpaceCardEmbedData 検証用）。 */
async function seedSpaceForTest(overrides?: {
  isPublished?: boolean;
  isActive?: boolean;
}): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `resolve-embed-loc-${suffix}`,
      name: `Resolve Embed Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      // sortOrder(既定 0) は isActive:true 時のみ有効な部分 unique index を持つ。
      // 他 fixture との衝突を避けるため非 active で作成する。
      isActive: false,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `resolve-embed-space-${suffix}`,
      name: `Resolve Embed Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isPublished: overrides?.isPublished ?? true,
      isActive: overrides?.isActive ?? true,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    locationId: location.id,
    cleanup: async () => {
      // FK 安全な順序（Space→Location は Restrict）。
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("resolveSpaceCardEmbedData", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ resolveSpaceCardEmbedData } =
      await import("@/shared/domain/spaces/public-queries"));
    await basePrisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("published + active space: Map に含まれ、全フィールドが正しく返される", async () => {
    const fixture = await seedSpaceForTest({
      isPublished: true,
      isActive: true,
    });
    try {
      const result = await resolveSpaceCardEmbedData([fixture.spaceId]);
      expect(result.has(fixture.spaceId)).toBe(true);

      const data = result.get(fixture.spaceId);
      expect(data).toBeDefined();
      if (data) {
        expect(data.id).toBe(fixture.spaceId);
        expect(data.slug).toMatch(/^resolve-embed-space-/);
        expect(data.name).toMatch(/^Resolve Embed Space /);
        expect(data.capacity).toBe(10);
        expect(data.hourlyPrice).toBe(1000);
        expect(data.mainImageUrl).toBe("https://example.com/space.jpg");
      }
    } finally {
      await fixture.cleanup();
    }
  });

  test("unpublished space (isPublished: false): Map に含まれない", async () => {
    const fixture = await seedSpaceForTest({
      isPublished: false,
      isActive: true,
    });
    try {
      const result = await resolveSpaceCardEmbedData([fixture.spaceId]);
      expect(result.has(fixture.spaceId)).toBe(false);
      expect(result.size).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("inactive space (isActive: false): Map に含まれない", async () => {
    const fixture = await seedSpaceForTest({
      isPublished: true,
      isActive: false,
    });
    try {
      const result = await resolveSpaceCardEmbedData([fixture.spaceId]);
      expect(result.has(fixture.spaceId)).toBe(false);
      expect(result.size).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("non-existent id: Map に含まれない（throw しない）", async () => {
    // 有効な UUID 形式だが存在しない id
    const nonexistentId = "00000000-0000-0000-0000-000000000000";
    const result = await resolveSpaceCardEmbedData([nonexistentId]);
    expect(result.has(nonexistentId)).toBe(false);
    expect(result.size).toBe(0);
  });

  test("empty ids array: 空 Map を返す（DB クエリを実行しない）", async () => {
    const result = await resolveSpaceCardEmbedData([]);
    expect(result.size).toBe(0);
    expect(result instanceof Map).toBe(true);
  });

  test("mixed: published+active と unpublished のうち、published+active のみ返される", async () => {
    const published = await seedSpaceForTest({
      isPublished: true,
      isActive: true,
    });
    const unpublished = await seedSpaceForTest({
      isPublished: false,
      isActive: true,
    });
    try {
      const result = await resolveSpaceCardEmbedData([
        published.spaceId,
        unpublished.spaceId,
      ]);
      expect(result.has(published.spaceId)).toBe(true);
      expect(result.has(unpublished.spaceId)).toBe(false);
      expect(result.size).toBe(1);
    } finally {
      await published.cleanup();
      await unpublished.cleanup();
    }
  });
});
