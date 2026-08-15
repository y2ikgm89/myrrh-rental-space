"use server";

import { randomUUID } from "node:crypto";
import type { SubmissionResult } from "@conform-to/react";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { eventBroadcastRateLimiter } from "@/shared/lib/rate-limit";
import { sendEventBroadcast } from "@/shared/domain/email/lib-dispatch";
import { getEventBroadcastPayload } from "@/shared/domain/events/email-queries";
import { DomainError } from "@/shared/domain/domain-error";
import { entityIdSchema } from "@/shared/lib/validations/entity-id";
import { eventBroadcastSchema } from "@/shared/lib/validations/event-broadcast";

const eventIdSchema = entityIdSchema("Event");

/**
 * イベント一斉配信 Server Action (T12)。
 *
 * conform `useActionState` 互換。`event.id` を `.bind(null, eventId)` で部分適用する。
 *
 * 実行順序:
 *   1. eventId の Zod 検証
 *   2. `executeConformMutation` で件名 / 本文を検証
 *   3. `executeAdminMutationResult`(resource: "event", action: "update") で
 *      認証 + RBAC + AuditLog を経由
 *   4. `checkActionRateLimit(eventBroadcastRateLimiter)` — 権限通過後の
 *      eventId 単位の第二防壁。認証前に消費すると `event:update` を持たない
 *      アカウントが共有バケットを焼ける
 *   5. `sendEventBroadcast` を呼んで参加者全員に fan-out
 *   6. 送信結果を検査する。**宛先が 1 件以上あるのに `sent === 0` なら成功にしない**
 *      — `DomainError` を投げてフォーム上部にエラーを出し、件名 / 本文を残す
 *   7. 成功時は `submission.reply()` (resetForm) を返す — 呼出側は `initialValue`
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

  return executeConformMutation(
    formData,
    eventBroadcastSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "update",
        resourceId: validId,
        execute: async () => {
          const rateLimit = await checkActionRateLimit({
            check: (_token) => eventBroadcastRateLimiter.check(validId),
          });
          if (!rateLimit.success) {
            throw new DomainError(rateLimit.error);
          }
          const broadcastNonce = randomUUID();
          const payload = await getEventBroadcastPayload(validId);
          if (!payload) {
            throw new DomainError("対象イベントが見つかりません", "NOT_FOUND");
          }
          const sendResult = await sendEventBroadcast(payload, {
            subject: data.subject,
            body: data.body,
            broadcastNonce,
          });
          // 送るべき相手が居たのに 1 通も送れていないなら成功にしない。
          // sendEventBroadcast (src/shared/lib/email/event-emails.ts) は fan-out 後に
          // 無条件で ok:true を返すので、ok だけを見ると「全通失敗」も成功になる。
          // 判定は sent 件数に一本化し、原因 (transport 無効 / 送信失敗) は
          // メッセージで出し分ける。transport 無効の文面は sendTemplateTestAction の
          // disabled 分岐と同じ契約に揃える。DomainError は
          // executeAdminMutationResult が MutationError に変換し、
          // executeConformMutation が formErrors に載せるので、resetForm を通らず
          // 件名 / 本文が保持される。
          if (payload.recipients.length > 0 && sendResult.sent === 0) {
            throw new DomainError(
              sendResult.ok
                ? "一斉配信メールを 1 通も送信できませんでした。時間をおいて再度お試しください。"
                : "メール送信が無効です。連携設定（/admin/settings/integrations?tab=resend）で Resend API キーを設定するか、環境変数 RESEND_API_KEY を設定してください。",
              "VALIDATION",
            );
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
