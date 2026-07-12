import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { formatJstDateString } from "@/shared/lib/date-format";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * 領収書発行 SSoT (Priority-10 audit #3、PR#17 domain 部分)。
 *
 * Reservation の PAID 遷移直後 (Stripe webhook) に自動採番される想定。
 * 呼出契約:
 * - 対象 Reservation は `paymentStatus === PAID` 必須 (呼出側 gate)
 * - 既に Receipt が存在する場合は既存を返す (冪等)
 * - 発行時点の Settings snapshot を issuerSnapshot に凍結 (append-only 証跡)
 *
 * 連番: ReceiptSequence の atomic increment (advisory lock で serialize)。
 * 年替わりで nextNo を 1 にリセット (「YYYY-XXXXXX」フォーマット、**JST 年**)。
 *
 * PDF レンダリング (@react-pdf/renderer 等) は別 PR。本 command は Receipt row の
 * 採番+永続化までを担当する。
 */
// advisory lock 採番 namespace (`.claude/rules/db-domain.md` の registry と一致)。
// 予約単位ロック (hashtext(reservationId)) と ReceiptSequence 単一行ロック
// (hashtext("receipt-sequence")) の両方で共有する。
const RECEIPT_LOCK_NAMESPACE = 728353;

/**
 * JST の年を返す (「YYYY-XXXXXX」serialNo の年ロールオーバー判定用)。
 *
 * 業務日付規約は JST-based (`.claude/rules/business-domain.md`) のため、
 * getUTCFullYear() や getFullYear() (server-local) は Cloud Run (TZ=UTC) 上で
 * 「JST 00:00–08:59 on Jan 1 は UTC 前年」の 9h ずれを起こす。
 * `formatJstDateString` (SSoT) で「YYYY-MM-DD in Asia/Tokyo」を得て年部分を切り出す。
 */
function getJstYear(): number {
  return Number.parseInt(formatJstDateString(new Date()).slice(0, 4), 10);
}

async function claimNextSerialNo(tx: Tx): Promise<string> {
  // ReceiptSequence 単一行の advisory lock (year 跨ぎ race 防止)。
  // hashtext("receipt-sequence") 固定 key で全 issue tx を serialize する。
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_LOCK_NAMESPACE}::int4, hashtext('receipt-sequence'))`;

  const currentYear = getJstYear();

  const existing = await tx.receiptSequence.findUnique({
    where: { id: "singleton" },
  });

  let nextNo: number;
  if (!existing || existing.year !== currentYear) {
    // 初回 or 年替わり: nextNo = 1、次発行後は 2 に上がる
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

async function fetchIssuerSnapshot(tx: Tx): Promise<Record<string, unknown>> {
  const settings = await tx.settings.findUnique({
    where: { id: "singleton" },
    select: {
      businessName: true,
      representativeName: true,
      registrationNumber: true,
      invoiceNumber: true,
      email: true,
      phoneNumber: true,
      postalCode: true,
      prefecture: true,
      city: true,
      streetAddress: true,
    },
  });
  return {
    // undefined を null に正規化 (JSON 永続化可能な shape)。適格請求書要件の
    // 事業者情報を発行時点で固定する (invoiceNumber を後日書き換えても
    // 既発行 Receipt は不変・append-only 証跡)。
    businessName: settings?.["businessName"] ?? null,
    representativeName: settings?.["representativeName"] ?? null,
    registrationNumber: settings?.["registrationNumber"] ?? null,
    invoiceNumber: settings?.["invoiceNumber"] ?? null,
    email: settings?.["email"] ?? null,
    phoneNumber: settings?.["phoneNumber"] ?? null,
    address: {
      postalCode: settings?.["postalCode"] ?? null,
      prefecture: settings?.["prefecture"] ?? null,
      city: settings?.["city"] ?? null,
      streetAddress: settings?.["streetAddress"] ?? null,
    },
    snapshotAt: new Date().toISOString(),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Reservation の PAID 遷移直後に領収書を採番・発行する (冪等)。
 *
 * @param reservationId 対象予約 ID
 * @param options 宛名・但書 (未指定なら customer 情報から自動)
 * @returns 発行または既存の Receipt レコード
 */
export async function issueReceiptForReservation(
  reservationId: string,
  options?: {
    recipientName?: string;
    subject?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    // ==============================
    // 予約単位 advisory lock (Codex P2 #1 対応)
    // ==============================
    // Stripe webhook の at-least-once 配信で同一 reservationId の issueReceipt が
    // 並列実行されうる。旧実装は tx 冒頭の findUnique で idempotent check を
    // していたが、その check は advisory lock の前に走るため両 tx が同時に「無し」
    // を観測し、後発が create で P2002 unique 制約違反を投げていた。
    //
    // 修正: 予約単位で advisory lock (namespace 728353 + hashtext(reservationId))
    // を tx 冒頭で先取して、以降の findUnique + serialNo claim + create を
    // 一つの critical section にする。lock 待ちに入った tx は先発の commit 後に
    // findUnique で既存 Receipt を観測して early return する。
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_LOCK_NAMESPACE}::int4, hashtext(${reservationId}))`;

    // Advisory lock 取得後の idempotent check (lock 取得前の check ではないので race free)
    const existing = await tx.receipt.findUnique({
      where: { reservationId },
    });
    if (existing) return existing;

    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId, deletedAt: null },
      select: {
        totalPrice: true,
        totalPriceWithTax: true,
        taxAmount: true,
        taxRate: true,
        paymentStatus: true,
        customer: {
          select: {
            lastName: true,
            firstName: true,
            companyName: true,
          },
        },
        guestLastName: true,
        guestFirstName: true,
        guestCompanyName: true,
      },
    });

    if (!reservation) {
      throw new DomainError("予約が見つかりません", "NOT_FOUND");
    }

    if (reservation.paymentStatus !== "PAID") {
      throw new DomainError(
        "決済確定 (PAID) 状態の予約のみ領収書を発行できます",
        "VALIDATION",
      );
    }

    const totalAmount =
      reservation.totalPriceWithTax ?? reservation.totalPrice ?? 0;
    if (totalAmount <= 0) {
      throw new DomainError(
        "金額 0 の予約は領収書を発行しません",
        "VALIDATION",
      );
    }

    // 宛名: options 優先 → guestCompanyName → customer.companyName → 姓名結合
    const guestName = reservation.guestCompanyName
      ? reservation.guestCompanyName
      : reservation.guestLastName || reservation.guestFirstName
        ? `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim()
        : null;
    const customerName = reservation.customer.companyName
      ? reservation.customer.companyName
      : `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
    const recipientName = options?.recipientName ?? guestName ?? customerName;

    const serialNo = await claimNextSerialNo(tx);
    const issuerSnapshot = await fetchIssuerSnapshot(tx);

    // Belt-and-suspenders: 予約単位 lock で serialize しているが、advisory lock は
    // session-level scope で稀に (別 pg connection pool 経由の重複配信等) 抜ける
    // ケースがあり得るため、@unique(reservationId) 違反時は既存を read-back して返す。
    try {
      return await tx.receipt.create({
        data: {
          serialNo,
          reservationId,
          recipientName,
          subject: options?.subject ?? "スペース利用料として",
          amount: totalAmount,
          taxAmount: reservation.taxAmount ?? 0,
          taxRate: reservation.taxRate ?? 0,
          issuerSnapshot: asPrismaInputJsonValue(
            issuerSnapshot,
            "issuerSnapshot が不正です",
          ),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const winner = await tx.receipt.findUnique({
          where: { reservationId },
        });
        if (winner) return winner;
      }
      throw error;
    }
  });
}
