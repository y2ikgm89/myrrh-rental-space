import "server-only";

import {
  fetchRegistrationDetailsForSideEffects,
  fetchRegistrationForSideEffects,
} from "@/shared/domain/events/registration-cancellation/registration-data";
import { runEventCancellationSideEffectsAndFlushAudit } from "@/shared/domain/events/registration-cancellation/run-side-effects";
import type { EventCancellationSideEffectInput } from "@/shared/domain/events/registration-cancellation/types";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

/**
 * キャンセル後の副作用統一実行。
 *
 * registration / details fetch 以外は `fireAndForget` で `after()` に委譲するため、
 * 呼び出し側の response latency は fetch 時間のみ（従来と同じ）。
 * 全副作用の outcome は集約 AuditLog metadata (`sideEffects`) に記録され、
 * Resend suppression / waitlist offer メール未達 / Stripe refund 失敗などが
 * 「完了表示 vs 実挙動」の乖離としてカスタマーサポート起点で観測可能になる
 * (CRITIC-6 + MYPAGE-EVENT-02)。
 *
 * 呼び出し条件:
 *   `applyEventRegistrationCancellation` が `success: true` を返した後にだけ呼ぶ。
 *   本関数は申込データの再取得を行うため、cancel transaction commit 後に呼ぶこと。
 */
export async function applyEventRegistrationCancellationSideEffects(
  input: EventCancellationSideEffectInput,
): Promise<void> {
  const [registration, details] = await Promise.all([
    fetchRegistrationForSideEffects(input.registrationId),
    fetchRegistrationDetailsForSideEffects(input.registrationId),
  ]);

  if (!registration || !details) {
    logError(
      new Error(
        `Cancellation side effects skipped: event registration ${input.registrationId} not found after cancel`,
      ),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyEventRegistrationCancellationSideEffects",
          registrationId: input.registrationId,
        },
      },
    );
    return;
  }

  fireAndForget(
    runEventCancellationSideEffectsAndFlushAudit({
      input,
      registration,
      details,
    }),
    {
      operation: "applyEventRegistrationCancellationSideEffects",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        registrationId: input.registrationId,
        channel: input.channel,
      },
    },
  );
}
