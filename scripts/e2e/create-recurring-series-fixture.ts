import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import {
  asPrismaInputJsonValue,
  parsePrismaInputJson,
} from "@/shared/db/prisma-input-json";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: 未キャンセルの `ReservationSeries`（WEEKLY BYDAY=TU COUNT=3）を
 * 専用 Location / Space / Customer ごと 1 組作成し、
 * `{ seriesId, firstInstanceId }` を JSON で stdout に出す。
 *
 * `e2e/authenticated/admin/create-recurring-reservation.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる。
 *
 * ## なぜ seed ではなく fixture script でその場作成するか
 *
 * この spec は **series を丸ごとキャンセルする**（3 択キャンセルの series-all）。
 * 以前は `prisma/seed.ts` の `seedRecurringReservationSeriesFixture` が作る
 * 共有 seed 行を消費していたため、fixture が **1 回しか使えなかった**:
 *
 * - 1 回目が失敗して Playwright が retry すると、series は既にキャンセル済みで
 *   `getSeededSeriesFirstInstanceId` が
 *   "Seeded ReservationSeries fixture not found" を throw する。
 *   **つまり初回失敗が必ず永続失敗に化ける**（CI run 30632351655 で実測:
 *   1 回目は streaming staging DOM による strict-mode violation、retry は
 *   fixture 不在で別のエラーになり、原因が二重に見えなくなった）。
 * - 同じ理由で spec をローカルで 2 回続けて流すこともできなかった。
 *
 * `create-toctou-capacity-one-fixture.ts` が同じ結論に先に到達している
 * （「seed に空 event を足す方式だと初回実行で capacity が消費されて retry 時に
 * 変質する」）。本 script はその方針を定期予約側へ揃えたもの。
 *
 * ## なぜ専用 Space を作るのか
 *
 * `Reservation` は同一 Space の時間帯重複を DB の EXCLUDE 制約で禁じている。
 * 既存 seed Space を使い回すと、実行のたびに未来枠を取り合って衝突しうる
 * （ずらし幅を乱数や時刻から作る方式は「たまに落ちる」を仕込むだけ）。
 * Space ごと分ければ**構造的に**衝突しない。
 *
 * `isPublished` は既定 false のままにする。公開 `/spaces` 一覧に出ないため
 * visual regression（`e2e/visual/public-pages.spec.ts` の `spaces-list.png`）に
 * 影響しない。
 *
 * ## cleanup しない理由
 *
 * CI の Postgres は run ごとに破棄され、ローカルの E2E webServer は起動時に
 * seed をやり直す。`create-toctou-capacity-one-fixture.ts` と同じく使い捨てにする。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

interface RecurringSeriesFixture {
  readonly seriesId: string;
  readonly firstInstanceId: string;
}

/** RRULE（WEEKLY BYDAY=TU COUNT=3）。UI の「毎週火曜 / 全 3 回」表示に対応する。 */
const RRULE = "FREQ=WEEKLY;BYDAY=TU;COUNT=3";

/** 1 instance の予約時間（分）。 */
const DURATION_MINUTES = 120;

const INSTANCE_COUNT = 3;

/** dtstart（固定 UTC、2027-05-04 は火曜）。E2E_FIXED_NOW_ISO より十分未来。 */
const DTSTART = new Date("2027-05-04T14:00:00.000Z");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const HOURLY_PRICE = 3000;
const TAX_RATE = 10;

/** rate plan resolver を経由しない直接 insert 用の空 breakdown スナップショット。 */
const EMPTY_RATE_BREAKDOWN = {
  schemaVersion: 1,
  segments: [],
  totalHours: 0,
  totalBasePrice: 0,
  holidayFlags: {},
};

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const unique = `${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}`;
    const descriptionText =
      "E2E 定期予約テスト用スペース（SeriesInfoSection / 3 択キャンセル検証）。";
    const descriptionHtml = buildParagraphHtml(descriptionText);

    // `Location.sortOrder` は **グローバルに unique**。固定値を使うと 2 回目の
    // 実行が `Unique constraint failed on the fields: ("sortOrder")` で落ちる
    // （= retry 不能という、この PR が消そうとしている欠陥そのもの）。
    // 既存最大値 + 1 を取る。この fixture は spec から逐次 1 回だけ呼ばれるので
    // read-then-write の競合は起きない（万一衝突しても unique 制約が大声で落ちる）。
    const maxSortOrder = await prisma.location.aggregate({
      _max: { sortOrder: true },
    });

    const location = await prisma.location.create({
      data: {
        slug: `e2e-recurring-loc-${unique}`,
        name: `E2E 定期予約テスト拠点 ${unique}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/location.jpg",
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });

    const space = await prisma.space.create({
      data: {
        slug: `e2e-recurring-space-${unique}`,
        name: `E2E 定期予約テストスペース ${unique}`,
        descriptionJson: parsePrismaInputJson(
          buildParagraphEditorStateJson(descriptionText),
          "recurring series fixture の descriptionJson が不正です",
        ),
        descriptionHtml,
        descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
        capacity: 10,
        hourlyPrice: HOURLY_PRICE,
        mainImageUrl: "https://example.com/space.jpg",
        locationId: location.id,
      },
      select: { id: true },
    });

    const customerEmail = `e2e-recurring-${unique}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        email: customerEmail,
        emailCanonical: customerEmail,
        lastName: "定期予約E2E",
        firstName: "太郎",
      },
      select: { id: true },
    });

    const basePrice = HOURLY_PRICE * (DURATION_MINUTES / 60);
    const taxAmount = Math.round((basePrice * TAX_RATE) / 100);
    const pricingSnapshot = {
      basePrice,
      totalPrice: basePrice,
      taxRateType: "standard" as const,
      taxRate: TAX_RATE,
      taxAmount,
      totalPriceWithTax: basePrice + taxAmount,
      rateBreakdownJson: asPrismaInputJsonValue(
        EMPTY_RATE_BREAKDOWN,
        "recurring series fixture の rateBreakdownJson が不正です",
      ),
    };

    const series = await prisma.reservationSeries.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        rrule: RRULE,
        dtstart: DTSTART,
        duration: DURATION_MINUTES,
        instanceCount: INSTANCE_COUNT,
        templateData: asPrismaInputJsonValue(
          {
            ...pricingSnapshot,
            rateBreakdownJson: EMPTY_RATE_BREAKDOWN,
            durationDiscountAmount: 0,
            spaceDiscountAmount: 0,
          },
          "recurring series fixture の templateData が不正です",
        ),
        agreementSnapshot: asPrismaInputJsonValue(
          { agreements: [] },
          "recurring series fixture の agreementSnapshot が不正です",
        ),
      },
      select: { id: true },
    });

    const instances = Array.from({ length: INSTANCE_COUNT }, (_, index) => {
      const startTime = new Date(DTSTART.getTime() + index * WEEK_MS);
      return {
        spaceId: space.id,
        customerId: customer.id,
        seriesId: series.id,
        recurrenceInstanceIndex: index,
        startTime,
        endTime: new Date(startTime.getTime() + DURATION_MINUTES * 60 * 1000),
        status: "CONFIRMED" as const,
        paymentStatus: "UNPAID" as const,
        notes: `[E2E] recurring series ${unique} ${String(index + 1)}/${String(INSTANCE_COUNT)}`,
        ...pricingSnapshot,
      };
    });
    await prisma.reservation.createMany({ data: instances });

    const firstInstance = await prisma.reservation.findFirstOrThrow({
      where: { seriesId: series.id },
      orderBy: { startTime: "asc" },
      select: { id: true },
    });

    const fixture: RecurringSeriesFixture = {
      seriesId: series.id,
      firstInstanceId: firstInstance.id,
    };
    console.log(JSON.stringify(fixture));
  } finally {
    await disconnect();
  }
}

try {
  await main();
  // pg pool のハンドルが残るとイベントループが空にならず、`execFile` の解決を
  // 待つ Playwright 側が spec ごとタイムアウトする
  // （`create-claim-reservation-fixture.ts` と同じ理由）。
  process.exit(0);
} catch (error) {
  console.error(
    "create-recurring-series-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
