import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * 管理画面 領収書詳細ページ用の domain query (RECEIPT-USEDAT-P2)。
 *
 * `src/app/(admin)/admin/(dashboard)/_shared/queries/receipt.ts` から `requireAdminPermission`
 * を通したうえで呼ばれる thin domain wrapper。app 層から `@/shared/db/prisma` を直 import
 * できないため、Prisma 呼び出しは全て本ファイルに集約する
 * (`shared/ の外に Prisma 直 import を残さない` architecture gate 対応)。
 *
 * ## Non-goal
 * - 一覧クエリ (`/admin/receipts` 一覧) は Phase 2 では提供しない。
 * - Ownership 検証は呼出側 (Receipt は polymorphic に Reservation / EventRegistration に
 *   紐づき、両方 orphan の場合もある — 監査証跡としてのみ参照可能)。
 */
export async function getReceiptDetailBySerialNoQuery(serialNo: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { serialNo },
    select: {
      id: true,
      serialNo: true,
      issuedAt: true,
      usedAt: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      taxRate: true,
      revision: true,
      reissuedFromId: true,
      reissuedReason: true,
      reservationId: true,
      eventRegistrationId: true,
      reservation: {
        select: {
          id: true,
          customer: {
            select: {
              lastName: true,
              firstName: true,
              email: true,
            },
          },
        },
      },
      eventRegistration: {
        select: {
          id: true,
          customer: {
            select: {
              lastName: true,
              firstName: true,
              email: true,
            },
          },
        },
      },
      reissuedTo: {
        select: {
          id: true,
          serialNo: true,
          revision: true,
          issuedAt: true,
        },
        orderBy: { revision: "asc" },
      },
    },
  });

  if (!receipt) return null;

  // up-chain: reissuedFromId を root まで辿る。Receipt chain は self-relation で線形
  // (fan-out なし) の想定だが、防御的に O(revision) で walk する (max ~10 revisions 想定)。
  const upChain: Array<{
    id: string;
    serialNo: string;
    revision: number;
    issuedAt: Date;
  }> = [];
  let cursor: string | null = receipt.reissuedFromId;
  const visited = new Set<string>();
  while (cursor !== null) {
    if (visited.has(cursor)) break; // cycle guard (schema 上不可能だが防御的)
    visited.add(cursor);
    const parent = await prisma.receipt.findUnique({
      where: { id: cursor },
      select: {
        id: true,
        serialNo: true,
        revision: true,
        issuedAt: true,
        reissuedFromId: true,
      },
    });
    if (!parent) break;
    upChain.unshift({
      id: parent.id,
      serialNo: parent.serialNo,
      revision: parent.revision,
      issuedAt: parent.issuedAt,
    });
    cursor = parent.reissuedFromId;
  }

  // Receipt モデルは `createAppPrismaClient` の Decimal → number result 拡張の
  // 対象外 (reservation / space / customer / settings / coupon のみ)。
  // Receipt.taxRate は Prisma Decimal のまま返るので、UI へ渡す前に number 化する。
  return {
    receipt: {
      ...receipt,
      taxRate: Number(receipt.taxRate.toString()),
    },
    upChain,
  };
}

export type ReceiptDetail = NonNullable<
  Awaited<ReturnType<typeof getReceiptDetailBySerialNoQuery>>
>;
