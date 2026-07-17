"use server";

import { randomUUID } from "node:crypto";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { eventBroadcastRateLimiter } from "@/shared/lib/rate-limit";
import { sendEventBroadcast } from "@/shared/lib/email/event-emails";
import { DomainError } from "@/shared/domain/domain-error";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

/**
 * 管理者オーサリング型 event broadcast (T12) — 件名 / 本文の Zod schema。
 *
 * subject / body の境界値:
 *  - subject: 1〜200 文字 (メール件名として実用的な上限)
 *  - body: 1〜5000 文字 (plain text 本文、改行込み想定)
 *
 * 空文字は Zod parse で reject する (空件名 / 空本文の送信は運用上の事故を招く)。
 */
export const eventBroadcastSchema = z.object({
  subject: z
    .string({ error: "件名を入力してください" })
    .trim()
    .min(1, "件名を入力してください")
    .max(200, "件名は 200 文字以内で入力してください"),
  body: z
    .string({ error: "本文を入力してください" })
    .trim()
    .min(1, "本文を入力してください")
    .max(5000, "本文は 5000 文字以内で入力してください"),
});

export type EventBroadcastFormData = z.infer<typeof eventBroadcastSchema>;

const eventIdSchema = prismaCuidIdSchema("イベント");

/**
 * イベント一斉配信 Server Action (T12)。
 *
 * conform `useActionState` 互換。`event.id` を `.bind(null, eventId)` で部分適用する。
 *
 * 実行順序:
 *   1. eventId の Zod 検証
 *   2. `checkActionRateLimit(eventBroadcastRateLimiter)` — eventId 単位の第二防壁
 *      (executeAdminMutationResult 内の RBAC + IAP と多層防御)
 *   3. `executeAdminMutationResult`(resource: "event", action: "update") で
 *      RBAC + AuditLog を経由
 *   4. `sendEventBroadcast` を呼んで参加者全員に fan-out
 *   5. 成功時は `submission.reply()` (resetForm) を返す — 呼出側は `initialValue`
 *      null で success を検出する
 *
 * broadcastNonce は `crypto.randomUUID` で action 実行ごとに生成 (Resend の
 * idempotencyKey が重複しないよう `sendEventBroadcast` に渡す)。
 *
 * 送信結果 `{sent, skipped}` は AuditLog metadata / UI の success meta で使えるよう
 * `MutationResult<TData>` の TData に載せて返す。conform SubmissionResult に data を
 * 直接載せられないため、送信件数の表示は今回は subject/body reset 完了の signal のみ
 * を UI に返し、実 sent 数の詳細表示は次 PR で AuditLog 履歴一覧に譲る。
 */
export async function broadcastEventAction(
  eventId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const idParsed = eventIdSchema.safeParse(eventId);
  if (!idParsed.success) {
    return {
      status: "error",
      error: { "": ["イベントIDが不正です"] },
    } satisfies SubmissionResult;
  }
  const validId = idParsed.data;

  // rate limit は executeAdminMutationResult より前 (IP でなく eventId をキーにする
  // 独立防壁のため IP 取得コスト無し・fail-closed)。expensive-admin ではなく専用の
  // eventBroadcastRateLimiter を使う。
  const rateLimit = await checkActionRateLimit({
    check: (_token) => eventBroadcastRateLimiter.check(validId),
  });
  if (!rateLimit.success) {
    return {
      status: "error",
      error: { "": [rateLimit.error] },
    } satisfies SubmissionResult;
  }

  return executeConformMutation(
    formData,
    eventBroadcastSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "update",
        resourceId: validId,
        execute: async () => {
          const broadcastNonce = randomUUID();
          const sendResult = await sendEventBroadcast(validId, {
            subject: data.subject,
            body: data.body,
            broadcastNonce,
          });
          if (!sendResult.ok) {
            // event が見つからない (deletedAt など) 場合は DomainError で NOT_FOUND 相当。
            // executeAdminMutationResult が MutationError に変換する。
            throw new DomainError("対象イベントが見つかりません", "NOT_FOUND");
          }
          return {
            sent: sendResult.sent,
            skipped: sendResult.skipped,
          };
        },
        // cache invalidation は不要 (event / registrations の状態は変わらない)。
        // AuditLog 記録は executeAdminMutationResult 内の logAction (resource:event
        // action:update resourceId:eventId) で自動で行われる。broadcast の subject/
        // body は AuditLog metadata に載せずに Resend dashboard 側で確認する運用
        // (metadata に本文を残すと PII 増加と保存 cost 増になる)。
      });

      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
    // resetForm: true は default (executeConformMutation)。件名 / 本文が空に戻り
    // BroadcastForm 側は lastResult.initialValue === null を成功シグナルにする。
  );
}
