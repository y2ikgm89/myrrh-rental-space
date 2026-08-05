/**
 * 領収書番号の連番が**年ごとに独立して**進むことを実 DB で確かめる。
 *
 * ## 何を守るのか
 *
 * `receipts.serial_no` は UNIQUE。したがって同じ番号を 2 度採ると、そのとき
 * 落ちるのは**領収書の発行**で、入金済みの顧客に領収書が出せなくなる。
 *
 * 20260805150000 以前の `receipt_sequences` は `id = 'singleton'` の 1 行だけを持ち、
 * `year` は「今どの年を数えているか」を表す可変フィールドだった。採番コードには
 *
 *     if (existing.year !== currentYear) { nextNo = 1; ... }
 *
 * という分岐があり、**別の年に切り替わると過去の年の到達点を捨てていた**。
 * 時計が戻る・年を跨いだ再実行でこの分岐が走ると、既に発行済みの番号を再び採る。
 *
 * 年を主キーにすればその分岐は不要になる。このテストは
 * **「年 A → 年 B → 年 A」と往復して、A の連番が続きから出ること**を見る。
 * 単一行モデルではここが 1 に戻るので必ず落ちる。
 *
 * ## 現在年に触らない
 *
 * `claimNextSerialNo` は JST の現在年で採番するので、これを直接呼ぶと共有 test DB の
 * 運用連番を進めてしまう。ここでは**採番規則そのもの**（年ごとの upsert +
 * increment）を、現在年から遠い年に対して同じ形で実行して確かめる。
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

/** tx を必ず巻き戻すための番兵。 */
const ROLLBACK = "__receipt_serial_per_year_rollback__";

/**
 * `claimNextSerialNo` と同じ採番（年の行を upsert して +1、採るのは 1 つ手前）。
 *
 * 実装をそのまま呼ばないのは、あちらが「JST の現在年」に固定で、共有 test DB の
 * 運用連番を進めてしまうため。**規則は同じ**なので、年を跨ぐ挙動の検査になる。
 */
async function claimFor(tx: TransactionClient, year: number): Promise<string> {
  const sequence = await tx.receiptSequence.upsert({
    where: { year },
    create: { year, nextNo: 2 },
    update: { nextNo: { increment: 1 } },
    select: { nextNo: true },
  });
  return `${year}-${(sequence.nextNo - 1).toString().padStart(6, "0")}`;
}

/** 遠未来の 2 年。現在年と衝突しない。 */
const YEAR_A = 2091;
const YEAR_B = 2092;

async function claimSequence(): Promise<string[]> {
  const claimed: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      // 共有 test DB に既にこの年の行があると「続きから」になって
      // 000001 を期待できない。実際に数えて確かめる。
      const existing = await tx.receiptSequence.count({
        where: { year: { in: [YEAR_A, YEAR_B] } },
      });
      expect({ years: [YEAR_A, YEAR_B], existing }).toEqual({
        years: [YEAR_A, YEAR_B],
        existing: 0,
      });

      claimed.push(await claimFor(tx, YEAR_A));
      claimed.push(await claimFor(tx, YEAR_A));
      // 別の年へ移る
      claimed.push(await claimFor(tx, YEAR_B));
      // 元の年へ戻る。**ここが続きから出るか**が本題。
      claimed.push(await claimFor(tx, YEAR_A));
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }
  return claimed;
}

describeMaybe("領収書番号は年ごとに独立して進む（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("年を往復しても前の年の連番が巻き戻らない", async () => {
    expect(await claimSequence()).toEqual([
      `${YEAR_A}-000001`,
      `${YEAR_A}-000002`,
      // 新しい年は 1 から
      `${YEAR_B}-000001`,
      // 戻ってきた年は 3 から（単一行モデルならここが 000001 になる）
      `${YEAR_A}-000003`,
    ]);
  }, 30_000);
});
