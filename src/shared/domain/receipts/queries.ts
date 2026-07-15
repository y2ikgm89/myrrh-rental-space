import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * Receipt ダウンロード用の lookup。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#4。
 * `/api/receipts/[serialNo]/pdf` Route Handler が ownership 検証と PDF 生成に必要な
 * 最小フィールドを取得する。
 *
 * ownership 検証:
 * - `reservation.customerId` (Reservation 由来の Receipt)
 * - `eventRegistration.customerId` (EventRegistration 由来の Receipt)
 * のいずれか一方が非 null。Route Handler が Better Auth session の customer.id と突合する。
 * ゲスト予約 (customerId=null) は署名 URL 経路で ownership を担保する。
 */
export async function findReceiptForDownload(serialNo: string) {
  return prisma.receipt.findFirst({
    where: { serialNo },
    select: {
      id: true,
      serialNo: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      taxRate: true,
      issuedAt: true,
      issuerSnapshot: true,
      reservation: {
        select: { customerId: true },
      },
      eventRegistration: {
        select: { customerId: true },
      },
    },
  });
}

export type ReceiptForDownload = Awaited<
  ReturnType<typeof findReceiptForDownload>
>;

/**
 * mypage / 顧客側の一覧・詳細で「領収書ダウンロード」リンクを出すかを判定するための
 * 軽量 lookup。serialNo のみを返す (URL 生成に必要な最小情報)。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#5。
 * Reservation / EventRegistration → 該当 Receipt の対応関係を 1 対 1 で解決する。
 * 未発行の場合は null を返し、UI 側で DL リンクを非表示にする。
 */
export async function findReceiptSerialNoByReservationId(
  reservationId: string,
): Promise<string | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { reservationId },
    select: { serialNo: true },
  });
  return receipt?.serialNo ?? null;
}

export async function findReceiptSerialNoByEventRegistrationId(
  eventRegistrationId: string,
): Promise<string | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { eventRegistrationId },
    select: { serialNo: true },
  });
  return receipt?.serialNo ?? null;
}
