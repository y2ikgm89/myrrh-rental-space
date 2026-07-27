import "server-only";

import {
  buildEmailPayload,
  fetchReservationForSideEffects,
} from "@/shared/domain/reservations/cancellation/reservation-data";
import { runCancellationSideEffectsAndFlushAudit } from "@/shared/domain/reservations/cancellation/run-instance-side-effects";
import type { CancellationSideEffectInput } from "@/shared/domain/reservations/cancellation/types";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * キャンセル後の副作用統一実行。
 *
 * reservation fetch 以外は `fireAndForget` で `after()` に委譲するため、
 * 呼び出し側の response latency は fetch 時間のみ（従来と同じ）。
 * 全副作用の outcome は集約 AuditLog metadata (`sideEffects`) に記録され、
 * Resend suppression / GCal 429 / SwitchBot 通信失敗などが「完了表示 vs 実挙動」の
 * 乖離としてカスタマーサポート起点で観測可能になる（CRITIC-6）。
 */
export async function applyCancellationSideEffects(
  input: CancellationSideEffectInput,
): Promise<void> {
  const reservation = await fetchReservationForSideEffects(input.reservationId);
  if (!reservation) {
    logError(
      new Error(
        `Cancellation side effects skipped: reservation ${input.reservationId} not found after cancel`,
      ),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyCancellationSideEffects",
          reservationId: input.reservationId,
        },
      },
    );
    return;
  }

  const payload = buildEmailPayload(reservation);
  const wasPaid =
    reservation.paymentStatus === PaymentStatus.PAID ||
    reservation.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;
  const requiresRefund = wasPaid && reservation.stripePaymentIntentId !== null;

  const run = runCancellationSideEffectsAndFlushAudit({
    input,
    reservation,
    payload,
    wasPaid,
    requiresRefund,
  });

  if (input.awaitCompletion) {
    await run;
    return;
  }

  fireAndForget(run, {
    operation: "applyCancellationSideEffects",
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: {
      reservationId: input.reservationId,
      channel: input.channel,
    },
  });
}
