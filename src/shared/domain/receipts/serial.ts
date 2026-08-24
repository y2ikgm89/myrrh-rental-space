import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatJstDateString } from "@/shared/lib/date-format";

/**
 * advisory lock 採番 namespace。
 * 予約/申込単位ロック (hashtext(entityId)) と ReceiptSequence 単一行ロック
 * (hashtext("receipt-sequence")) の両方で共有する。
 */
import { RECEIPT_LOCK_NAMESPACE } from "@/shared/domain/advisory-lock-namespaces";

export { RECEIPT_LOCK_NAMESPACE };

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
 * 業務日付規約は JST-based のため、
 * getUTCFullYear() や getFullYear() (server-local) は Cloud Run (TZ=UTC) 上で
 * 「JST 00:00–08:59 on Jan 1 は UTC 前年」の 9h ずれを起こす。
 */
function getJstYear(): number {
  return Number.parseInt(formatJstDateString(new Date()).slice(0, 4), 10);
}

function formatSerialNo(year: number, no: number): string {
  return `${year}-${no.toString().padStart(6, "0")}`;
}

/**
 * その年に**既に発行された**最大の連番。1 件も無ければ 0。
 *
 * `receipt_sequences` にその年の行が無くても、`receipts` には既にその年の番号が
 * 存在しうる。カウンタ表と発行済み記録は別のテーブルなので、行の有無だけを見て
 * 1 から振り直すと**発行済みの番号をもう一度採る**。`receipts.serial_no` は
 * UNIQUE なので、そのとき落ちるのは領収書の発行そのもの。
 *
 * 生 SQL にしているのは、連番部分を**数値として**比較するため。`serial_no` の
 * 辞書順は 6 桁 0 埋めである限り数値順と一致するが、桁が増えた瞬間に静かに
 * 逆転する（`999999` > `1000000`）。ここは会計証跡なので前提に頼らない。
 * 年は 4 桁固定（`receipt_sequences_year_range_check` が 2000..9999 を強制）なので
 * 連番は 6 文字目から始まる。
 */
async function highestIssuedNo(tx: ReceiptTx, year: number): Promise<number> {
  const rows = await tx.$queryRaw<
    readonly { readonly high: number | null }[]
  >`SELECT max(substring(serial_no from 6)::int) AS high
      FROM receipts
     WHERE serial_no ~ ${`^${year}-[0-9]+$`}`;
  return rows[0]?.high ?? 0;
}

/**
 * 指定した年の次の serialNo を採番する。
 *
 * **年ごとに 1 行**（主キーが年）なので、年が変わったら新しい行が生えるだけで
 * 済む。単一行 + `year` 列だった頃は「年が変わったらカウンタを 1 に戻す」分岐が
 * 必要で、その分岐は**過去の年の到達点を破壊する** — 時計が戻る・年を跨いだ
 * 再実行で発行済みの番号を再び採り、`receipts.serial_no` の UNIQUE に弾かれて
 * 領収書が出せなくなる。行を分けたことでその分岐自体が無くなった。
 *
 * 行の有無に関わらず、**その年の発行済み最大値を下限にする**（`highestIssuedNo`）。
 * カウンタ表がどう出来たか（移行・復元・手動削除・部分リストア）に関係なく
 * 「一度発行した番号は二度と出ない」が成り立つ。
 *
 * この突合わせは発行 1 回あたり `receipts` のスキャン 1 回を追加するが、
 * 領収書発行は管理画面のボタンと hourly cron だけで hot path ではない。
 * 会計証跡の一意性を優先する。
 *
 * advisory lock は残す。read-then-write を含むので、直列化はここが担う。
 */
export async function claimSerialNoForYear(
  tx: ReceiptTx,
  year: number,
): Promise<string> {
  await acquireReceiptAdvisoryLock(tx, "receipt-sequence");

  const existing = await tx.receiptSequence.findUnique({
    where: { year },
    select: { nextNo: true },
  });

  if (existing) {
    // カウンタが発行済み最大値より**後退している**ことがある（部分リストア、
    // 手動復旧、行の作り直し）。監査 A-65: 以前はここでカウンタだけを
    // increment しており、その年は**発行のたびに P2002 で落ち続ける**状態になった。
    //
    // 行が無い年（下の分岐）では既にこの突合わせをしている。行の有無で
    // 保証が変わる理由は無いので、両方で同じ不変条件を成立させる。
    const claimed = Math.max(
      existing.nextNo,
      (await highestIssuedNo(tx, year)) + 1,
    );
    await tx.receiptSequence.update({
      where: { year },
      data: { nextNo: claimed + 1 },
    });
    return formatSerialNo(year, claimed);
  }

  const claimed = (await highestIssuedNo(tx, year)) + 1;
  await tx.receiptSequence.create({ data: { year, nextNo: claimed + 1 } });
  return formatSerialNo(year, claimed);
}

/** JST の現在年で採番する（本番経路）。 */
export async function claimNextSerialNo(tx: ReceiptTx): Promise<string> {
  return claimSerialNoForYear(tx, getJstYear());
}
