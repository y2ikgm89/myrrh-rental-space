import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatJstDateString } from "@/shared/lib/date-format";

/**
 * advisory lock 採番 namespace (`.claude/rules/db-domain.md` の registry と一致)。
 * 予約/申込単位ロック (hashtext(entityId)) と ReceiptSequence 単一行ロック
 * (hashtext("receipt-sequence")) の両方で共有する。
 */
export const RECEIPT_LOCK_NAMESPACE = 728353;

export type ReceiptTx = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/** 領収書ドメイン共通の pg_advisory_xact_lock (namespace 728353 + hashtext(lockKey))。 */
export async function acquireReceiptAdvisoryLock(
  tx: ReceiptTx,
  lockKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_LOCK_NAMESPACE}::int4, hashtext(${lockKey}))`;
}

/**
 * JST の年を返す (「YYYY-XXXXXX」serialNo の年ロールオーバー判定用)。
 *
 * 業務日付規約は JST-based (`.claude/rules/business-domain.md`) のため、
 * getUTCFullYear() や getFullYear() (server-local) は Cloud Run (TZ=UTC) 上で
 * 「JST 00:00–08:59 on Jan 1 は UTC 前年」の 9h ずれを起こす。
 */
function getJstYear(): number {
  return Number.parseInt(formatJstDateString(new Date()).slice(0, 4), 10);
}

/**
 * ReceiptSequence の atomic increment で次の serialNo を採番する。
 * ReceiptSequence 単一行の advisory lock で year 跨ぎ race を防ぐ。
 */
export async function claimNextSerialNo(tx: ReceiptTx): Promise<string> {
  await acquireReceiptAdvisoryLock(tx, "receipt-sequence");

  const currentYear = getJstYear();

  const existing = await tx.receiptSequence.findUnique({
    where: { id: "singleton" },
  });

  let nextNo: number;
  if (!existing || existing.year !== currentYear) {
    nextNo = 1;
    await tx.receiptSequence.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", year: currentYear, nextNo: 2 },
      update: { year: currentYear, nextNo: 2 },
    });
  } else {
    nextNo = existing.nextNo;
    await tx.receiptSequence.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", year: currentYear, nextNo: nextNo + 1 },
      update: { year: currentYear, nextNo: nextNo + 1 },
    });
  }

  const padded = nextNo.toString().padStart(6, "0");
  return `${currentYear}-${padded}`;
}
