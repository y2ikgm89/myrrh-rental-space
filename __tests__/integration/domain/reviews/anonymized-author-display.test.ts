/**
 * 退会（匿名化）した顧客のレビューは、本文が残り著者だけが「匿名」になることの検査。
 *
 * ## なぜ実 DB でやるのか
 *
 * 判定材料は `Customer.anonymizedAt` と `Customer.lastName` の組み合わせで、
 * 匿名化コマンドがその両方を同じ tx で書き換える。mock で作った顧客行を渡すと
 * 「匿名化がどんな値を書くか」というテスト側の思い込みを検査するだけになり、
 * 実装が placeholder の綴りを変えても気づけない。
 *
 * ## 何を固定するか
 *
 * 1. 匿名化前は姓のイニシャル（`山田` → `山○`）
 * 2. 匿名化後は `匿名`。placeholder（`削除済み`）の頭文字を取って `削○` と
 *    出さない — 内部の placeholder が実在の姓であるかのように見える
 * 3. `title` / `comment` は匿名化後も残る。退会で消せると「低評価を消すために
 *    退会する」経路になる
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// `use cache` 経路の cacheLife / cacheTag は Next のリクエストスコープ外では
// 呼べない。公式 Bun re-export pattern で actual を spread し、この 2 つだけ
// no-op に落とす（部分 mock にすると同 module の他 export が undefined になる）。
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
}));

// feature module `reviews` の ON/OFF は共有 test-db の設定行に依存する。
// ここで見たいのは著者表示なので、gate は素通りさせる。
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PublicQueriesModule =
  typeof import("@/shared/domain/reviews/public-queries");
type LifecycleModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");

let prisma: PrismaModule["prisma"];
let getPublishedReviewsForSpace: PublicQueriesModule["getPublishedReviewsForSpace"];
let anonymizeCustomerCommand: LifecycleModule["anonymizeCustomerCommand"];

const COMMENT = `本文${crypto.randomUUID().slice(0, 8)}`;

const created = {
  locationId: "",
  spaceId: "",
  customerId: "",
  reservationId: "",
  reviewId: "",
};

async function fetchReview() {
  const reviews = await getPublishedReviewsForSpace(created.spaceId);
  return reviews.find((review) => review.id === created.reviewId);
}

describeMaybe("退会した顧客のレビュー表示", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getPublishedReviewsForSpace } =
      await import("@/shared/domain/reviews/public-queries"));
    ({ anonymizeCustomerCommand } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));

    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `review-anon-loc-${suffix}`,
        name: `Review Anon Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/l.jpg",
        isActive: false,
      },
      select: { id: true },
    });
    created.locationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: `review-anon-space-${suffix}`,
        name: `Review Anon Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>t</p>",
        descriptionPlainText: "t",
        capacity: 4,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/s.jpg",
        locationId: created.locationId,
        isPublished: false,
        isActive: false,
        reviewsEnabled: true,
      },
      select: { id: true },
    });
    created.spaceId = space.id;

    const email = `review-anon-${suffix}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        email,
        emailCanonical: email,
        lastName: "山田",
        firstName: "太郎",
      },
      select: { id: true },
    });
    created.customerId = customer.id;

    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        spaceId: created.spaceId,
        customerId: created.customerId,
        startTime: start,
        endTime: new Date(start.getTime() + 60 * 60 * 1000),
        basePrice: 1000,
        totalPrice: 1000,
        taxAmount: 100,
        totalPriceWithTax: 1100,
        taxRate: 10,
        taxRateType: "STANDARD",
        rateBreakdownJson: {},
      },
      select: { id: true },
    });
    created.reservationId = reservation.id;

    const review = await prisma.spaceReview.create({
      data: {
        spaceId: created.spaceId,
        customerId: created.customerId,
        reservationId: created.reservationId,
        rating: 4,
        title: "題名",
        comment: COMMENT,
        isPublished: true,
      },
      select: { id: true },
    });
    created.reviewId = review.id;
  });

  afterAll(async () => {
    await prisma.spaceReview.deleteMany({ where: { id: created.reviewId } });
    await prisma.reservation.deleteMany({
      where: { id: created.reservationId },
    });
    await prisma.customer.deleteMany({ where: { id: created.customerId } });
    await prisma.space.deleteMany({ where: { id: created.spaceId } });
    await prisma.location.deleteMany({ where: { id: created.locationId } });
    await prisma.$disconnect();
  });

  test("退会前は姓のイニシャルを出す", async () => {
    const review = await fetchReview();

    expect(review?.customerInitial).toBe("山○");
  });

  test("退会後は「匿名」を出し、本文は残す", async () => {
    await anonymizeCustomerCommand({
      customerId: created.customerId,
      reason: "customer-requested",
    });

    const review = await fetchReview();

    // placeholder（削除済み）の頭文字を取ると「削○」になり、内部の値が
    // 実在の姓であるかのように見える。
    expect(review?.customerInitial).toBe("匿名");
    expect(review?.comment).toBe(COMMENT);
  });
});
