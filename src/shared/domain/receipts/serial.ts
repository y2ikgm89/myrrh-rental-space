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
 *
 * **年ごとに 1 行**（主キーが年）なので、年が変わったら新しい行が生えるだけで
 * 済む。単一行 + `year` 列だった頃は「年が変わったらカウンタを 1 に戻す」分岐が
 * 必要で、その分岐は**過去の年の到達点を破壊する** — 時計が戻る・年を跨いだ
 * 再実行で発行済みの番号を再び採り、`receipts.serial_no` の UNIQUE に弾かれて
 * 領収書が出せなくなる。行を分けたことでその分岐自体が無くなった。
 *
 * advisory lock は残す。Prisma の `upsert` は条件次第で SELECT→INSERT に分解され
 * （prisma#20229）、並行呼び出しで同じ番号を返しうるため、直列化はここが担う。
 */
export async function claimNextSerialNo(tx: ReceiptTx): Promise<string> {
  await acquireReceiptAdvisoryLock(tx, "receipt-sequence");

  const currentYear = getJstYear();

  // upsert は**更新後**の行を返す。`nextNo` は「次に発行する番号」なので、
  // 今回採るのはその 1 つ手前。新規作成時は 2 が返り、採るのは 1。
  const sequence = await tx.receiptSequence.upsert({
    where: { year: currentYear },
    create: { year: currentYear, nextNo: 2 },
    update: { nextNo: { increment: 1 } },
    select: { nextNo: true },
  });

  const padded = (sequence.nextNo - 1).toString().padStart(6, "0");
  return `${currentYear}-${padded}`;
}
