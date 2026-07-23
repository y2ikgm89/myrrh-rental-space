"use server";

import { z } from "zod";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reissueReceiptCommand } from "@/shared/domain/receipts/issue";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { reissueReceiptInputSchema } from "@/shared/lib/validations/receipt-reissue";

const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });

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
  const parsedReservationId = reservationIdSchema.safeParse(reservationId);
  if (!parsedReservationId.success) {
    return createValidationMutationError(parsedReservationId.error);
  }

  const parsedInput = reissueReceiptInputSchema.safeParse({
    originalReceiptId,
    reason,
  });
  if (!parsedInput.success) {
    return createValidationMutationError(parsedInput.error);
  }

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: parsedReservationId.data,
    execute: async (user) => {
      // UA-HORIZ-02: 領収書再発行の AuditLog に ip / userAgent を metadata として
      // 載せる (admin session hijack シナリオでの forensics 対称化)。
      // buildAuditRequestContext は headers() ベースで cf-connecting-ip を trust する
      // SSoT (`@/shared/lib/audit-request-context`)。
      const { ip, userAgent } = await buildAuditRequestContext();

      const receipt = await reissueReceiptCommand({
        originalReceiptId: parsedInput.data.originalReceiptId,
        reason: parsedInput.data.reason,
        // Codex P2 (PR #1129, comment 3589127456) binding check: stale/crafted call で
        // reservation A の action が別 reservation B (or event registration) の receipt を
        // mutate するのを domain 層で FORBIDDEN reject する。
        expectedReservationId: parsedReservationId.data,
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
          reissuedReason: parsedInput.data.reason,
          reservationId: parsedReservationId.data,
          ...(ip !== null && { ip }),
          ...(userAgent !== null && { userAgent }),
        },
      });

      return { receiptId: receipt.id, serialNo: receipt.serialNo };
    },
    afterSuccess: () => {
      // reservation 側の Receipt 参照 (mypage 用リンク等) を invalidate
      invalidateReservationCaches(parsedReservationId.data, null);
    },
  });
}
