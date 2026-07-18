"use server";

import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reissueReceiptCommand } from "@/shared/domain/receipts/issue";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";

/**
 * イベント申込に紐づく領収書の再発行 (RECEIPT-USEDAT-P1 Phase 1)。
 *
 * `reissueReservationReceipt` の event-registration 対称実装。domain 側 command
 * (`reissueReceiptCommand`) は既に polymorphic (`expectedEventRegistrationId` を
 * 受ける binding check あり) なので、本 action は wrapper のみ。
 *
 * ## 挙動
 * - `expectedEventRegistrationId` binding check で reservation 領収書との取り違えを FORBIDDEN reject。
 * - AuditLog は本 action で記録 (append-only 証跡)。
 * - afterSuccess で events キャッシュを invalidate (mypage の申込詳細に貼られた
 *   Receipt リンクが新 serialNo を指すよう更新)。
 *
 * ## Phase 2 予定
 * 管理画面 UI (`/admin/events/registrations/[id]` の再発行ボタン + reason モーダル)
 * を Phase 2 で追加する。本 action は BE のみ (call surface だけ提供)。
 */
export async function reissueEventRegistrationReceipt(
  eventRegistrationId: string,
  originalReceiptId: string,
  reason: string,
): Promise<MutationResult<{ receiptId: string; serialNo: string }>> {
  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: eventRegistrationId,
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();

      const receipt = await reissueReceiptCommand({
        originalReceiptId,
        reason,
        actorUserId: user.id,
        expectedEventRegistrationId: eventRegistrationId,
      });

      await createAuditLogRecord({
        userId: user.id,
        action: AuditAction.CREATE,
        resource: "receipt",
        resourceId: receipt.id,
        newValue: {
          serialNo: receipt.serialNo,
          revision: receipt.revision,
        },
        metadata: {
          reissuedFromId: originalReceiptId,
          reissuedReason: reason,
          eventRegistrationId,
          ...(ip !== null && { ip }),
          ...(userAgent !== null && { userAgent }),
        },
      });

      return { receiptId: receipt.id, serialNo: receipt.serialNo };
    },
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}
