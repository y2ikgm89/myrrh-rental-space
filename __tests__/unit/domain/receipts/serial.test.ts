/**
 * claimNextSerialNo / acquireReceiptAdvisoryLock の unit test。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockTxExecuteRaw = mock(() => Promise.resolve(undefined));
const mockTxReceiptSequenceFindUnique = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve({ id: "singleton", year: 2026, nextNo: 1 }));
const mockTxReceiptSequenceUpsert = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve({}));

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
      findUnique: (...args: unknown[]) =>
        mockTxReceiptSequenceFindUnique(...args),
      upsert: (...args: unknown[]) => mockTxReceiptSequenceUpsert(...args),
    },
  } as unknown as ReceiptTx;
}

describe("receipt serial kernel", () => {
  beforeEach(() => {
    mockTxExecuteRaw.mockReset();
    mockTxReceiptSequenceFindUnique.mockReset();
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

  test("初回採番は YYYY-000001 を返し nextNo=2 に upsert する", async () => {
    mockTxReceiptSequenceFindUnique.mockResolvedValue(null);
    const tx = makeTx();

    const serialNo = await claimNextSerialNo(tx);

    expect(serialNo).toBe("2026-000001");
    expect(mockTxReceiptSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ year: 2026, nextNo: 2 }),
        update: expect.objectContaining({ year: 2026, nextNo: 2 }),
      }),
    );
  });

  test("同年の連続採番は nextNo を increment する", async () => {
    mockTxReceiptSequenceFindUnique.mockResolvedValue({
      id: "singleton",
      year: 2026,
      nextNo: 42,
    });
    const tx = makeTx();

    const serialNo = await claimNextSerialNo(tx);

    expect(serialNo).toBe("2026-000042");
    expect(mockTxReceiptSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ year: 2026, nextNo: 43 }),
      }),
    );
  });

  test("年替わり時は nextNo を 1 にリセットする", async () => {
    mockTxReceiptSequenceFindUnique.mockResolvedValue({
      id: "singleton",
      year: 2025,
      nextNo: 999,
    });
    const tx = makeTx();

    const serialNo = await claimNextSerialNo(tx);

    expect(serialNo).toBe("2026-000001");
    expect(mockTxReceiptSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ year: 2026, nextNo: 2 }),
      }),
    );
  });
});
