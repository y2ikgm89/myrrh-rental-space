import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { asPrismaInputJsonValue } from "@/shared/db/json";

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
 * 年替わりで nextNo を 1 にリセット (「YYYY-XXXXXX」フォーマット)。
 *
 * PDF レンダリング (@react-pdf/renderer 等) は別 PR。本 command は Receipt row の
 * 採番+永続化までを担当する。
 */
const RECEIPT_SEQUENCE_LOCK_NAMESPACE = 728353;

async function claimNextSerialNo(tx: Tx): Promise<string> {
  // ReceiptSequence 単一行の advisory lock (year 跨ぎ race 防止)。
  // hashtext("receipt-sequence") で固定 key。
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_SEQUENCE_LOCK_NAMESPACE}::int4, hashtext('receipt-sequence'))`;

  const now = new Date();
  const currentYear = now.getUTCFullYear();

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
    // 既発行なら idempotent に既存を返す
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

    return tx.receipt.create({
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
  });
}
