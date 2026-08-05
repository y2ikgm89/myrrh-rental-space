/**
 * claimNextSerialNo / acquireReceiptAdvisoryLock の unit test。
 *
 * ここで見るのは**採番の形**（どの年の行を、どう更新して、どの番号を返すか）。
 * 年を跨いだときに前の年の到達点が保たれるかは DB の主キーが決めることなので、
 * `__tests__/integration/domain/receipts/serial-per-year.test.ts` が実 DB で見る。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockTxExecuteRaw = mock(() => Promise.resolve(undefined));
const mockTxReceiptSequenceUpsert = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve({ nextNo: 2 }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async () => undefined,
  },
}));

mock.module("@/shared/lib/date-format", () => ({
  formatJstDateString: () => "2026-07-27",
}));

const {
  acquireReceiptAdvisoryLock,
  claimNextSerialNo,
  RECEIPT_LOCK_NAMESPACE,
} = await import("@/shared/domain/receipts/serial");

type ReceiptTx = Parameters<typeof claimNextSerialNo>[0];

function makeTx(): ReceiptTx {
  return {
    $executeRaw: mockTxExecuteRaw,
    receiptSequence: {
      upsert: (...args: unknown[]) => mockTxReceiptSequenceUpsert(...args),
    },
  } as unknown as ReceiptTx;
}

describe("receipt serial kernel", () => {
  beforeEach(() => {
    mockTxExecuteRaw.mockReset();
    mockTxReceiptSequenceUpsert.mockReset();
    mockTxExecuteRaw.mockResolvedValue(undefined);
  });

  test("RECEIPT_LOCK_NAMESPACE は db-domain registry の 728353", () => {
    expect(RECEIPT_LOCK_NAMESPACE).toBe(728353);
  });

  test("acquireReceiptAdvisoryLock は pg_advisory_xact_lock を executeRaw する", async () => {
    const tx = makeTx();
    await acquireReceiptAdvisoryLock(tx, "res-abc");
    expect(mockTxExecuteRaw).toHaveBeenCalledTimes(1);
  });

  test("採番は advisory lock を取ってから行う", async () => {
    // ロックを取らずに upsert すると、Prisma の upsert が SELECT→INSERT に
    // 分解されたとき（prisma#20229）同じ番号を 2 度返しうる。**順序が保護の実体**。
    const calls: string[] = [];
    mockTxExecuteRaw.mockImplementation(() => {
      calls.push("lock");
      return Promise.resolve(undefined);
    });
    mockTxReceiptSequenceUpsert.mockImplementation(() => {
      calls.push("upsert");
      return Promise.resolve({ nextNo: 2 });
    });

    await claimNextSerialNo(makeTx());

    expect(calls).toEqual(["lock", "upsert"]);
  });

  test("その年の行を upsert し、更新後の 1 つ手前を採る", async () => {
    // 行が無ければ nextNo=2 で作られ、採るのは 1。
    mockTxReceiptSequenceUpsert.mockResolvedValue({ nextNo: 2 });
    const tx = makeTx();

    const serialNo = await claimNextSerialNo(tx);

    expect(serialNo).toBe("2026-000001");
    expect(mockTxReceiptSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: 2026 },
        create: { year: 2026, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      }),
    );
  });

  test("連続採番は increment 後の値から 1 を引いた番号を返す", async () => {
    mockTxReceiptSequenceUpsert.mockResolvedValue({ nextNo: 43 });
    const tx = makeTx();

    expect(await claimNextSerialNo(tx)).toBe("2026-000042");
  });

  test("年はリセット分岐ではなく where 条件として使われる", async () => {
    // 旧実装は「行の year が現在年と違えばカウンタを 1 に戻す」分岐を持ち、
    // それが過去の年の到達点を壊していた。**分岐が無いこと**を、
    // 別の年の行が存在しても upsert の形が変わらないことで固定する。
    mockTxReceiptSequenceUpsert.mockResolvedValue({ nextNo: 8 });

    expect(await claimNextSerialNo(makeTx())).toBe("2026-000007");
    // `update` に year を書かない = 既存行の year を書き換えない。
    const args = mockTxReceiptSequenceUpsert.mock.calls[0]?.[0];
    expect(JSON.stringify(args)).not.toContain('"update":{"year"');
  });
});
