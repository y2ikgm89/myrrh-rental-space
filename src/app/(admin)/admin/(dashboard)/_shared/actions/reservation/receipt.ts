"use server";

import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reissueReceiptCommand } from "@/shared/domain/receipts/issue";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";

/**
 * 管理者による領収書再発行 (task #7 PR#6)。
 *
 * `reissueReceiptCommand` で:
 * - 元 Receipt を orphan 化 (`reservationId` を NULL に update)
 * - 新 Receipt を create (元の内容継承 + reissuedFromId chain + revision +1 + 新 serialNo)
 * - issuerSnapshot は **再発行時点** の Settings を再取得
 *
 * AuditLog は本 action で記録 (append-only 証跡)。
 */
export async function reissueReservationReceipt(
  reservationId: string,
  originalReceiptId: string,
  reason: string,
): Promise<MutationResult<{ receiptId: string; serialNo: string }>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async (user) => {
      const receipt = await reissueReceiptCommand({
        originalReceiptId,
        reason,
        actorUserId: user.id,
        // Codex P2 (PR #1129, comment 3589127456) binding check: stale/crafted call で
        // reservation A の action が別 reservation B (or event registration) の receipt を
        // mutate するのを domain 層で FORBIDDEN reject する。
        expectedReservationId: reservationId,
      });

      // AuditLog: 再発行を記録 (append-only、元 Receipt / 新 Receipt の両方 id + reason を metadata)
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
          reservationId,
        },
      });

      return { receiptId: receipt.id, serialNo: receipt.serialNo };
    },
    afterSuccess: () => {
      // reservation 側の Receipt 参照 (mypage 用リンク等) を invalidate
      invalidateReservationCaches(reservationId, null);
    },
  });
}
