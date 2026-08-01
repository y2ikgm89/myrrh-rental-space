"use server";

import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { requestReceiptResendByEmail } from "@/shared/domain/receipts/resend";
import { sendReceiptResendEmail } from "@/shared/domain/email/lib-dispatch";
import type { SubmissionResult } from "@conform-to/react";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { receiptResendRequestSchema } from "@/shared/lib/validations/receipt-resend";
import {
  checkActionRateLimit,
  checkBotHeuristics,
  checkEmailRateLimit,
} from "@/shared/lib/action-helpers";
import {
  receiptResendByEmailRateLimiter,
  receiptResendBySerialNoRateLimiter,
  receiptResendRequestRateLimiter,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * ゲスト向け領収書再送信リクエスト Server Action (RECEIPT-RESEND-P1)。
 *
 * ## セキュリティ階層
 *  1. IP rate-limit (`receiptResendRequestRateLimiter` — 5/hour/IP)
 *  2. Zod parse (serialNo / email / turnstileToken の shape 検証)
 *  3. Bot heuristics (honeypot + 3s 未満 submit を bot 判定)
 *  4. Email 単位 rate-limit (`receiptResendByEmailRateLimiter` — 3/hour/email)
 *  5. Turnstile 検証 (`guest_receipt_resend_request`)
 *  6. SerialNo 単位 rate-limit (`receiptResendBySerialNoRateLimiter` — 3/hour/serialNo)
 *  7. Domain command (Receipt lookup + timing-safe email 一致 + Case B/C 分岐)
 *  8. **常に success を返す** — enumeration 対策で match/no-match を client に露出しない
 *
 * ## SerialNo rate-limit を Turnstile より後に置く理由 (P1)
 * serialNo は `YYYY-NNNNNN` の sequential 連番で推測可能なため、Turnstile より
 * 前に置くと email 所有証明を一切持たない第三者が推測した serialNo + 適当な
 * email で空リクエストを 3 回連投するだけで shared bucket (3/hour/serialNo) を
 * 枯渇させ、正規の受信者本人が 1 時間締め出される (`receipt PDF` の per-serialNo
 * rate limit で Codex #1426 が指摘し PR #1428 で修正した DoS と同型)。
 * Turnstile 検証はここでは email 所有権を証明しないが、bot heuristics より
 * 強い「実ブラウザ相当のクライアントが必要」という費用を攻撃者に課す。domain
 * command (DB read) は従来通り Turnstile の直後に置かれたままなので、
 * serialNo 単位の DB read 上限 (3/hour) 自体は Turnstile 通過者に対しても
 * 変わらず維持される — 失われるのは「Turnstile 無しで 3 回消費できる」余地のみ。
 *
 * ## enumeration 対策
 * Domain command が `null` (未発見・email mismatch・orphan) を返した場合でも
 * 呼出側には成功として返し、client 側は同一の「完了画面」を表示する。内部ログには
 * 失敗理由を残すが、attacker が serialNo / email の存在確認に本 endpoint を使えない
 * 設計にする (Stripe recovery flow と同型)。
 */

export async function requestReceiptResendAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    receiptResendRequestSchema,
    // Zod parse は wrapper が先に済ませる（上記 JSDoc の階層 2）。handler は 1 と
    // 3 以降を担う。IP rate-limit を schema より後に置いても、DB / 外部 API を
    // 叩く前に落ちる点は変わらない。
    async ({ serialNo, email, website, formRenderedAt, turnstileToken }) => {
      // 1. IP rate-limit
      const ipRateLimit = await checkActionRateLimit(
        receiptResendRequestRateLimiter,
      );
      if (!ipRateLimit.success) {
        return { ok: false, error: ipRateLimit.error };
      }

      // 3. Bot heuristics (DB/外部 API 呼出なし・軽い順に並べる)
      const botCheck = checkBotHeuristics({
        honeypot: website,
        formRenderedAt,
      });
      if (!botCheck.success) {
        return { ok: false, error: botCheck.error };
      }

      // 4. Email 単位の追加バケット
      const emailRateLimit = await checkEmailRateLimit(
        receiptResendByEmailRateLimiter,
        email,
      );
      if (!emailRateLimit.success) {
        return { ok: false, error: emailRateLimit.error };
      }

      // 5. Turnstile (P1: SerialNo バケットより先に置く — 上記 JSDoc 参照)
      const turnstile = await validateTurnstile({
        token: turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.guest_receipt_resend_request,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      // 6. SerialNo 単位の追加バケット
      const serialNoLimit =
        await receiptResendBySerialNoRateLimiter.check(serialNo);
      if (!serialNoLimit.success) {
        return {
          ok: false,
          error:
            "この領収書に対する再送信リクエストが多すぎます。しばらく時間をおいてからお試しください",
        };
      }

      // 7. Domain command
      try {
        const result = await requestReceiptResendByEmail({ serialNo, email });

        if (result !== null) {
          // メール送信 (失敗しても enumeration 対策で client には成功を返す)
          const emailResult = await sendReceiptResendEmail({
            recipientEmail: result.recipientEmail,
            serialNo: result.receipt.serialNo,
            recipientName: result.receipt.recipientName,
            subject: result.receipt.subject,
            amount: result.receipt.amount,
            taxAmount: result.receipt.taxAmount,
            issuedAt: result.receipt.issuedAt,
            ...(result.previousSerialNo !== undefined
              ? { previousSerialNo: result.previousSerialNo }
              : {}),
          });

          if (!emailResult.ok) {
            logError(new Error(`Guest receipt resend email failed`), {
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "sendReceiptResendEmail",
                reason: emailResult.reason,
                serialNo: result.receipt.serialNo,
              },
            });
          }

          // AuditLog: guest 経路の証跡 (fire-and-forget, chain tx は別接続)。
          // Case C (wasReissued=true) = CREATE、Case B = UPDATE として action 種別を分ける。
          const { ip, userAgent } = await buildAuditRequestContext();
          const auditPromise = createAuditLogRecord({
            action: result.wasReissued
              ? AuditAction.CREATE
              : AuditAction.UPDATE,
            resource: "receipt",
            resourceId: result.receipt.id,
            metadata: {
              path: "guest-resend-request",
              serialNo: result.receipt.serialNo,
              wasReissued: result.wasReissued,
              emailSent: emailResult.ok,
              ...(result.previousSerialNo !== undefined
                ? { previousSerialNo: result.previousSerialNo }
                : {}),
              ...(ip !== null ? { ip } : {}),
              ...(userAgent !== null ? { userAgent } : {}),
            },
          });
          fireAndForget(auditPromise, {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            operation: "receiptResendAuditLog",
            context: { serialNo: result.receipt.serialNo },
          });
        } else {
          // enumeration: mismatch でも client には成功を返す。内部ログには理由のみ残す
          // (serialNo / email 詳細は残さない — 攻撃者に強い oracle を与えないため)。
          logError(new Error("Guest receipt resend: no match or orphan"), {
            category: ErrorCategory.AUTHORIZATION,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "requestReceiptResendAction",
              reason: "no_match_or_orphan",
            },
          });
        }

        return { ok: true };
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: { operation: "requestReceiptResendAction" },
        });
        return {
          ok: false,
          error:
            "再送信リクエストの処理中にエラーが発生しました。しばらく時間をおいてから再度お試しください。",
        };
      }
    },
  );
}
