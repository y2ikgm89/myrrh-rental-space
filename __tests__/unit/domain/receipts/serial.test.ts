/**
 * claimNextSerialNo / claimSerialNoForYear / acquireReceiptAdvisoryLock の unit test。
 *
 * ここで見るのは**採番の形**（何をどの順に呼び、どの番号を返すか）。年を跨いだとき
 * 前の年の到達点が保たれるか、カウンタ行が無い年で発行済みを追い越すかは
 * `__tests__/integration/domain/receipts/serial-per-year.test.ts` が実 DB で見る。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockTxExecuteRaw = mock(() => Promise.resolve(undefined));
const mockTxQueryRaw = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve([{ high: null }]),
);
const mockFindUnique = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockUpdate = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ nextNo: 2 }),
);
const mockCreate = mock<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({}),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async () => undefined,
  },
}));

const {
  acquireReceiptAdvisoryLock,
  claimNextSerialNo,
  claimSerialNoForYear,
  RECEIPT_LOCK_NAMESPACE,
} = await import("@/shared/domain/receipts/serial");

type ReceiptTx = Parameters<typeof claimNextSerialNo>[0];

/** 呼び出し順を記録する。順序そのものが保護の実体なので見えるようにする。 */
const calls: string[] = [];

function makeTx(): ReceiptTx {
  return {
    $executeRaw: (...args: unknown[]) => {
      calls.push("lock");
      return mockTxExecuteRaw(...(args as []));
    },
    $queryRaw: (...args: unknown[]) => {
      calls.push("highestIssued");
      return mockTxQueryRaw(...args);
    },
    receiptSequence: {
      findUnique: (...args: unknown[]) => {
        calls.push("findUnique");
        return mockFindUnique(...args);
      },
      update: (...args: unknown[]) => {
        calls.push("update");
        return mockUpdate(...args);
      },
      create: (...args: unknown[]) => {
        calls.push("create");
        return mockCreate(...args);
      },
    },
  } as unknown as ReceiptTx;
}

describe("receipt serial kernel", () => {
  beforeEach(() => {
    calls.length = 0;
    mockTxExecuteRaw.mockReset();
    mockTxQueryRaw.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockTxExecuteRaw.mockResolvedValue(undefined);
    mockTxQueryRaw.mockResolvedValue([{ high: null }]);
    mockFindUnique.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ nextNo: 2 });
    mockCreate.mockResolvedValue({});
  });

  test("RECEIPT_LOCK_NAMESPACE は db-domain registry の 728353", () => {
    expect(RECEIPT_LOCK_NAMESPACE).toBe(728353);
  });

  test("acquireReceiptAdvisoryLock は pg_advisory_xact_lock を executeRaw する", async () => {
    await acquireReceiptAdvisoryLock(makeTx(), "res-abc");
    expect(mockTxExecuteRaw).toHaveBeenCalledTimes(1);
  });

  test("読む前に advisory lock を取る", async () => {
    // read-then-write なので、ロックが先でなければ並行呼び出しが同じ番号を返す。
    // **順序が保護の実体**。
    await claimSerialNoForYear(makeTx(), 2026);
    expect(calls[0]).toBe("lock");
  });

  test("行がある年は increment して 1 つ手前を返す", async () => {
    mockFindUnique.mockResolvedValue({ nextNo: 42 });
    mockUpdate.mockResolvedValue({ nextNo: 43 });

    expect(await claimSerialNoForYear(makeTx(), 2026)).toBe("2026-000042");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: 2026 },
        data: { nextNo: { increment: 1 } },
      }),
    );
    // 既存行があるなら発行済みを数え直す必要はない。
    expect(calls).not.toContain("highestIssued");
  });

  test("行が無い年は発行済みが 0 件なら 1 から", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockTxQueryRaw.mockResolvedValue([{ high: null }]);

    expect(await claimSerialNoForYear(makeTx(), 2026)).toBe("2026-000001");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { year: 2026, nextNo: 2 },
    });
  });

  test("行が無い年は発行済み最大値を追い越す", async () => {
    // カウンタ表と発行済み記録は別テーブル。行が無いことは
    // 「まだ 1 番も出していない」を意味しない（Codex #1946）。
    mockFindUnique.mockResolvedValue(null);
    mockTxQueryRaw.mockResolvedValue([{ high: 7 }]);

    expect(await claimSerialNoForYear(makeTx(), 2026)).toBe("2026-000008");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { year: 2026, nextNo: 9 },
    });
  });

  test("claimNextSerialNo は JST の現在年で採番する", async () => {
    mockFindUnique.mockResolvedValue({ nextNo: 5 });
    mockUpdate.mockResolvedValue({ nextNo: 6 });

    // formatJstDateString の mock は 2026-07-27 を返す。
    expect(await claimNextSerialNo(makeTx())).toBe("2026-000005");
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { year: 2026 } }),
    );
  });
});
