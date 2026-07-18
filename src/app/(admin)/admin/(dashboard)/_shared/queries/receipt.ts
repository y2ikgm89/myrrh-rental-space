import "server-only";

import { getReceiptDetailBySerialNoQuery } from "@/shared/domain/receipts/admin-queries";
import { requireAdminPermission } from "./_helpers";

/**
 * 管理画面 領収書詳細ページ (`/admin/receipts/[serialNo]`) 用の thin admin wrapper。
 *
 * RECEIPT-USEDAT-P2: Phase 1 (#1211) で追加した `Receipt.usedAt` および Phase 1
 * 以前からの `reissuedFromId` / `revision` / `reissuedReason` を管理画面で可視化する。
 *
 * ## 権限
 * Receipt は Reservation / EventRegistration に polymorphic に紐づく (どちらか片方の
 * FK が非 NULL、または orphan 化 = 再発行済みの旧 revision で両方 NULL)。VIEWER 以上は
 * `reservation:read` と `event:read` の両方を持つため、ここでは `reservation:read` を
 * 通ることをもって領収書監査ログとして参照可能とみなす (最小限の gate)。
 *
 * 実 query は `@/shared/domain/receipts/admin-queries` に集約 (app 層から prisma を
 * 直 import できない architecture gate 対応)。
 */
export async function getReceiptDetailBySerialNo(serialNo: string) {
  await requireAdminPermission("reservation", "read");
  return getReceiptDetailBySerialNoQuery(serialNo);
}

export type { ReceiptDetail } from "@/shared/domain/receipts/admin-queries";
