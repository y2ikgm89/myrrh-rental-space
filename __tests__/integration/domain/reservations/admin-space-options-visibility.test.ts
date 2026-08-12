/**
 * `getSpacesForReservationQuery` が**非公開スペースも返す**ことの回帰テスト。
 *
 * 管理画面の予約経路は非公開スペースへの予約を意図的に許容している
 * （`previewReservationPricing` の `requirePublished` が admin 側で `false`、
 * `createAdminReservationCommand` / `updateAdminReservationCommand` の空間検索も
 * `where: { id, isActive: true }`）。にもかかわらずこのクエリだけが
 * `isPublished: true` で絞っており、書き込み側が受け付けるスペースを選択肢が
 * 出さないという食い違いがあった。実害は 3 つ:
 *
 * 1. 非公開スペースの既存予約を編集フォームで開くと Select が未選択表示になる
 * 2. 一覧に表示されている予約をスペースで絞り込めない
 * 3. カレンダー（`getSpacesForCalendarQuery`）には出るのに作成フォームには出ない
 *
 * 非公開スペースが**消える**方向の退行を検出したいので、公開 / 非公開を 1 件ずつ
 * 作って両方が返ることを見る（非公開だけだと「全部返している」実装でも通る）。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { getSpacesForReservationQuery } =
  await import("@/shared/domain/reservations/admin-queries");

describe("getSpacesForReservationQuery: 非公開スペースの可視性", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("isActive なら isPublished を問わず候補に出る（isPublished も返す）", async () => {
    const testId = randomUUID();

    const location = await prisma.location.create({
      data: {
        slug: `space-visibility-loc-${testId}`,
        name: `Space Visibility Location ${testId}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: 999_000_000 + Math.floor(Math.random() * 1000),
      },
    });

    const spaceData = (published: boolean) => ({
      slug: `space-visibility-${published ? "pub" : "unpub"}-${testId}`,
      name: `Space Visibility ${published ? "Published" : "Unpublished"} ${testId}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isActive: true,
      isPublished: published,
    });

    const published = await prisma.space.create({ data: spaceData(true) });
    const unpublished = await prisma.space.create({ data: spaceData(false) });

    // 非活性（soft delete 相当）は従来どおり候補から外れる。
    const inactive = await prisma.space.create({
      data: {
        ...spaceData(false),
        slug: `space-visibility-off-${testId}`,
        isActive: false,
      },
    });

    try {
      const options = await getSpacesForReservationQuery();
      const byId = new Map(options.map((o) => [o.id, o]));

      expect(byId.get(published.id)?.isPublished).toBe(true);
      expect(byId.get(unpublished.id)?.isPublished).toBe(false);
      expect(byId.has(inactive.id)).toBe(false);
    } finally {
      await prisma.space.deleteMany({
        where: { id: { in: [published.id, unpublished.id, inactive.id] } },
      });
      await prisma.location.delete({ where: { id: location.id } });
    }
  });
});
