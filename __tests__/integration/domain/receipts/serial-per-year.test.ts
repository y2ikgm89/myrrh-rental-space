/**
 * 領収書番号が**一度発行したら二度と出ない**ことを実 DB で確かめる。
 *
 * ## 何が守られるのか
 *
 * `receipts.serial_no` は UNIQUE。同じ番号を 2 度採ると、そのとき落ちるのは
 * **領収書の発行**で、入金済みの顧客に領収書が出せなくなる。
 *
 * 番号の出どころは `receipt_sequences`（カウンタ）だが、**発行済みの記録は
 * `receipts` にある**。この 2 つは別のテーブルなので、片方だけを見ると衝突する。
 * ここでは 2 つの経路を実際に走らせる:
 *
 *   1. **年を往復する** — 20260805150000 以前は `id = 'singleton'` の 1 行に
 *      `year` を持ち、「年が変わったらカウンタを 1 に戻す」分岐があった。
 *      その分岐は過去の年の到達点を捨てる
 *   2. **カウンタ行が無い年に、既発行の番号がある** — 年をキーにした直後や、
 *      復元・移行の直後に起きる。カウンタ表だけを見て 1 から振り直すと衝突する
 *
 * 2 は Codex のレビュー（PR #1946）で指摘された経路。実装は「行が無ければ
 * その年の発行済み最大値を引き継ぐ」ようにしてあり、このテストがそれを実測する。
 *
 * ## 現在年に触らない
 *
 * `claimNextSerialNo` は JST の現在年で採番するので、直接呼ぶと共有 test DB の
 * 運用連番を進めてしまう。年を引数に取る `claimSerialNoForYear`（本番経路が
 * そのまま呼んでいる関数）を遠未来の年で叩く。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（runner 経由なら自動注入）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type TransactionClient = Parameters<
  Parameters<PrismaModule["prisma"]["$transaction"]>[0]
>[0];

let prisma: PrismaModule["prisma"];
let claimSerialNoForYear: (typeof import("@/shared/domain/receipts/serial"))["claimSerialNoForYear"];

/** tx を必ず巻き戻すための番兵。 */
const ROLLBACK = "__receipt_serial_per_year_rollback__";

/** 遠未来の 2 年。運用連番と衝突しない。 */
const YEAR_A = 2091;
const YEAR_B = 2092;

/**
 * その年のカウンタ行と発行済み領収書が無いことを実際に数える。
 *
 * 共有 test DB なので「たぶん空」で済ませない。空でなければ件数を添えて落とす。
 */
async function assertYearsAreUnused(tx: TransactionClient): Promise<void> {
  const sequences = await tx.receiptSequence.count({
    where: { year: { in: [YEAR_A, YEAR_B] } },
  });
  const receipts = await tx.receipt.count({
    where: {
      OR: [
        { serialNo: { startsWith: `${YEAR_A}-` } },
        { serialNo: { startsWith: `${YEAR_B}-` } },
      ],
    },
  });
  expect({ sequences, receipts }).toEqual({ sequences: 0, receipts: 0 });
}

/** 領収書 1 件を作るのに必要な行を tx 内で揃える。巻き戻すので後始末は要らない。 */
async function createReservation(tx: TransactionClient): Promise<string> {
  const suffix = crypto.randomUUID();
  const location = await tx.location.create({
    data: {
      slug: `serial-loc-${suffix}`,
      name: `Serial Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.test/loc.jpg",
      sortOrder: 0,
      // `locations_active_sort_order_key` は isActive: true の行だけの partial unique。
      isActive: false,
    },
    select: { id: true },
  });
  const space = await tx.space.create({
    data: {
      slug: `serial-space-${suffix}`,
      name: `Serial Space ${suffix}`,
      descriptionJson: {},
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.test/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });
  const customer = await tx.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `serial-${suffix}@example.test`,
      emailCanonical: `serial-${suffix}@example.test`,
    },
    select: { id: true },
  });
  const reservation = await tx.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime: new Date("2099-02-01T10:00:00.000Z"),
      endTime: new Date("2099-02-01T12:00:00.000Z"),
      status: "CONFIRMED",
      basePrice: 1000,
      totalPrice: 1000,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: 1000,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 100,
      totalPriceWithTax: 1100,
    },
    select: { id: true },
  });
  return reservation.id;
}

async function withRolledBackTx<T>(
  run: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const box: { value?: T } = {};
  try {
    await prisma.$transaction(async (tx) => {
      await assertYearsAreUnused(tx);
      box.value = await run(tx);
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }
  // run が値を返す前に throw していたら、ここで落として黙って通さない。
  expect(box.value).toBeDefined();
  return box.value as T;
}

describeMaybe("領収書番号は二度と重複しない（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ claimSerialNoForYear } =
      await import("@/shared/domain/receipts/serial"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("年を往復しても前の年の連番が巻き戻らない", async () => {
    const claimed = await withRolledBackTx(async (tx) => [
      await claimSerialNoForYear(tx, YEAR_A),
      await claimSerialNoForYear(tx, YEAR_A),
      // 別の年へ移る
      await claimSerialNoForYear(tx, YEAR_B),
      // 元の年へ戻る。**ここが続きから出るか**が本題。
      await claimSerialNoForYear(tx, YEAR_A),
    ]);

    expect(claimed).toEqual([
      `${YEAR_A}-000001`,
      `${YEAR_A}-000002`,
      // 新しい年は 1 から
      `${YEAR_B}-000001`,
      // 戻ってきた年は 3 から（単一行モデルならここが 000001 になる）
      `${YEAR_A}-000003`,
    ]);
  }, 30_000);

  test("カウンタ行が無くても、その年の発行済み番号を追い越す", async () => {
    // Codex #1946 の指摘した経路。カウンタ表と発行済み記録は別のテーブルなので、
    // 行が無いことは「まだ 1 番も出していない」を意味しない。
    const claimed = await withRolledBackTx(async (tx) => {
      const reservationId = await createReservation(tx);
      await tx.receipt.create({
        data: {
          serialNo: `${YEAR_A}-000007`,
          reservationId,
          recipientName: "山田 太郎",
          amount: 1000,
          taxRate: 10,
          issuerSnapshot: {},
        },
      });
      // カウンタ行は作らない（= 移行直後・復元直後の状態）
      return [
        await claimSerialNoForYear(tx, YEAR_A),
        await claimSerialNoForYear(tx, YEAR_A),
      ];
    });

    // 000001 を返すと既発行の 000007 とは衝突しないが、そのまま進めば必ず衝突する。
    // 発行済み最大値の次から始めることで、以後どこでも重ならない。
    expect(claimed).toEqual([`${YEAR_A}-000008`, `${YEAR_A}-000009`]);
  }, 30_000);
});
