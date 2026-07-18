/**
 * イベント参加申込キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。各副作用は `fireAndForget` 並列で
 * 投げ、個別失敗は `logError` で記録する。
 * 設計は `reservations/cancellation-side-effects.ts` と同型
 * （GCal 同期削除は EventRegistration にカレンダー同期フィールドが無いため対象外）。
 *
 * 含まれる副作用:
 *   1. Stripe refund（`paymentStatus === PAID | PARTIALLY_REFUNDED` かつ
 *      `stripePaymentIntentId` あり のときのみ自動発火）。
 *      `Settings.refundPolicy` が設定されていれば tier ベースで返金額を算出し、
 *      未設定なら残額全額を返金する。policy 適用結果が 0 円なら refund 全 skip。
 *      MYPAGE-EVENT-02: 予約キャンセル (`reservations/cancellation-side-effects.ts`)
 *      と対称の挙動を保証する（従来はイベント側のみ手動対応必須で顧客誤解の原因）。
 *   2. 参加者向けキャンセル確認メール（CANCEL ICS 添付）
 *   3. 管理者向け管理者通知メール
 *   4. 管理者向け in-app 通知（channel 含む、PAID 自動返金時は要確認タイトルへ昇格）
 *   5. AuditLog 書き込み（actor / channel / IP / UA / requiresRefund / wasPaid を記録）
 *   6. FIFO 繰り上げ当選メール（`input.promoted` が非 null のときのみ。
 *      `applyEventRegistrationCancellation` が同一 tx 内で
 *      `offerNextWaitlistEntryCommand` を呼び、CONFIRMED 由来のキャンセルで
 *      空いた枠に次の WAITLISTED を昇格させた場合に送る）
 *
 * 呼び出し条件:
 *   `applyEventRegistrationCancellation` が `success: true` を返した後にだけ呼ぶ。
 *   本関数は申込データの再取得を行うため、cancel transaction commit 後に呼ぶこと。
 *
 * @module shared/domain/events/registration-cancellation-side-effects
 */

import "server-only";

import { AuditAction, PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { getEventWaitlistOfferPaymentContext } from "@/shared/domain/events/waitlist-queries";
import { refundEventRegistrationPaymentCommand } from "@/shared/domain/events/payment-commands";
import {
  calculateRefundAmount,
  parseRefundPolicy,
  type RefundPolicy,
} from "@/shared/domain/refund/policy";
import type { WaitlistPromotionOutcome } from "@/shared/domain/events/registration-cancel-core";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  sendEventAdminNotification,
  sendEventRegistrationCancelled,
} from "@/shared/lib/email/event-emails";
import { sendEventWaitlistOffered } from "@/shared/lib/email/event-waitlist-emails";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  CANCELLED_BY,
  NOTIFICATION_TYPE,
  REFUNDED_BY_TYPE,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";

export type EventCancelChannel = "admin" | "customer-mypage" | "customer-token";

export interface EventCancellationSideEffectInput {
  registrationId: string;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: EventCancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセルでは値あり、ゲスト/管理者では null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: {
    ip: string | null;
    userAgent: string | null;
    /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
    tokenFingerprint?: string | null;
  };
  /**
   * `applyEventRegistrationCancellation` の戻り値 `promoted` をそのまま渡す。
   * CONFIRMED 由来のキャンセルで空いた枠に FIFO 先頭の WAITLISTED が
   * 昇格した場合のみ非 null。呼び出し側（3 つの cancel 経路すべて）は
   * ドメインコマンドの戻り値を素通しするだけでよい（このヘルパー内部で
   * 「昇格していたら繰り上げ当選メールを送る」判断まで完結させる SSoT）。
   */
  promoted: WaitlistPromotionOutcome;
  /**
   * MYPAGE-EVENT-02: 呼出側が `Settings.refundPolicy` を事前に取得済ならその snapshot を
   * 渡す（`reservations/cancellation-side-effects.ts` の同名フィールドと同型契約）。
   *
   * - 省略 (undefined) → 従前どおり per-call で `Settings.findUnique` を実行
   * - `RefundPolicy` → その snapshot を使用
   * - `null` → 「policy 未設定 = 残額全額」を明示 (parseRefundPolicy が返す null を snapshot 化)
   */
  refundPolicySnapshot?: RefundPolicy | null;
}

const CHANNEL_TO_CANCELLED_BY: Record<EventCancelChannel, CancelledByType> = {
  admin: CANCELLED_BY.ADMIN,
  "customer-mypage": CANCELLED_BY.CUSTOMER_MYPAGE,
  "customer-token": CANCELLED_BY.CUSTOMER_TOKEN,
};

interface SideEffectRegistration {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  quantity: number;
  icsSequence: number;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  paidAmount: number | null;
  event: { title: string };
  slot: { startAt: Date };
}

async function fetchRegistrationForSideEffects(
  registrationId: string,
): Promise<SideEffectRegistration | null> {
  return prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      quantity: true,
      icsSequence: true,
      // MYPAGE-EVENT-02: PAID / PARTIALLY_REFUNDED 判定・Stripe refund 起票・
      // policy tier 計算 (slot.startAt = イベント開始時刻) に必要なフィールドを追加。
      paymentStatus: true,
      stripePaymentIntentId: true,
      paidAmount: true,
      event: { select: { title: true } },
      slot: { select: { startAt: true } },
    },
  });
}

function channelLabel(channel: EventCancelChannel): string {
  switch (channel) {
    case "admin":
      return "管理者";
    case "customer-mypage":
      return "顧客（マイページ）";
    case "customer-token":
      return "顧客（メールリンク）";
  }
}

/**
 * キャンセル後の副作用統一実行。
 *
 * fireAndForget を集約することで、呼び出し側 action を読みやすく保ち、
 * 副作用 1 つの追加・除去が全経路に等しく反映されることを保証する。
 */
export async function applyEventRegistrationCancellationSideEffects(
  input: EventCancellationSideEffectInput,
): Promise<void> {
  const [registration, details] = await Promise.all([
    fetchRegistrationForSideEffects(input.registrationId),
    getEventRegistrationDetailsForEmail(input.registrationId),
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

  // MYPAGE-EVENT-02: Stripe refund 判定 (Reservation 側と対称)。
  // PAID / PARTIALLY_REFUNDED (追加返金分が残っているケース) の両方をキャンセル時
  // auto-refund の対象とする。REFUNDED / UNPAID / PENDING / FAILED は対象外。
  const wasPaid =
    registration.paymentStatus === PaymentStatus.PAID ||
    registration.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;
  const requiresRefund = wasPaid && registration.stripePaymentIntentId !== null;

  // 1. Stripe refund (MYPAGE-EVENT-02: reservation cancel と対称)
  //   - actorType=AUTO_ON_CANCEL
  //   - Settings.refundPolicy が設定されていれば tier ベース計算で amount を決定
  //   - policy 未設定なら amount 未指定 (残額全額を返金、後方互換動作)
  //   - policy 適用結果が 0 円なら refund 全 skip (キャンセル自体は続行、in-app 通知の
  //     「要返金確認」タイトルは維持して運用側の判断を仰ぐ)
  if (requiresRefund) {
    // Reservation 側と同型の snapshot 優先ロジック (bulk 経路がある想定で拡張可能に
    // しておくが、event 側は現状 bulk cancel が存在しないため常に per-call fetch)。
    const policy: RefundPolicy | null =
      input.refundPolicySnapshot !== undefined
        ? input.refundPolicySnapshot
        : parseRefundPolicy(
            (
              await prisma.settings.findUnique({
                where: { id: "singleton" },
                select: { refundPolicy: true },
              })
            )?.refundPolicy,
          );

    // policy 未設定 (null) → 残額全額返金 (現状の後方互換動作を維持)
    // policy 設定あり → tier 選定で amount 計算 (0 なら refund skip)
    let refundAmount: number | undefined;
    if (policy !== null && registration.paidAmount !== null) {
      refundAmount = calculateRefundAmount(
        policy,
        registration.paidAmount,
        registration.slot.startAt,
        new Date(),
      );
    }

    if (refundAmount === undefined || refundAmount > 0) {
      fireAndForget(
        refundEventRegistrationPaymentCommand({
          registrationId: input.registrationId,
          actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
          // UA-HORIZ-04: 起点のキャンセル request context (ip / userAgent) を継承し、
          // AUTO_ON_CANCEL 経由の refund AuditLog にも forensic ヘッダーを載せる
          // (Reservation 側と同型)。
          request: {
            ip: input.request.ip,
            userAgent: input.request.userAgent,
          },
          ...(refundAmount !== undefined ? { amount: refundAmount } : {}),
        }).then(() => {
          return;
        }),
        {
          operation: "autoRefundEventRegistrationOnCancel",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            registrationId: input.registrationId,
            channel: input.channel,
            ...(refundAmount !== undefined
              ? { policyRefundAmount: refundAmount }
              : {}),
          },
        },
      );
    } else {
      // Policy による refundRate=0% → 返金 skip。運用側の「要返金確認」通知タイトル
      // (下段の requiresRefund 分岐) はそのまま昇格させて、admin 側で手動対応を明示的に促す。
      logError(
        new Error(
          "Auto refund skipped for event registration: policy refund rate is 0%",
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "autoRefundEventRegistrationOnCancel",
            registrationId: input.registrationId,
            reason: "policyRefundRateZero",
          },
        },
      );
    }
  }

  // 2 & 3. 参加者向けキャンセル確認メール + 管理者通知メール
  fireAndForget(
    Promise.all([
      sendEventRegistrationCancelled({
        registrationId: registration.id,
        customerName: registration.name,
        customerEmail: registration.email,
        eventTitle: registration.event.title,
        eventStartTime: details.startTime,
        eventEndTime: details.endTime,
        location: details.location ?? undefined,
        quantity: registration.quantity,
        icsSequence: registration.icsSequence,
        format: details.format,
        meetingUrl: details.meetingUrl,
      }),
      sendEventAdminNotification(
        {
          registrationId: registration.id,
          eventId: registration.eventId,
          participantName: registration.name,
          participantEmail: registration.email,
          eventTitle: registration.event.title,
          eventStartTime: details.startTime,
          quantity: registration.quantity,
          currentRegistrations: details.confirmedCount,
          capacity: details.capacity,
        },
        "cancellation",
      ),
    ]),
    {
      operation: "sendEventCancellationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        registrationId: input.registrationId,
        channel: input.channel,
      },
    },
  );

  // 4. 管理者向け in-app 通知
  //
  // resourceId は AdminNotification.resourceId（@db.Uuid）を意図した項目だが、
  // Event.id は cuid()（VarChar(30)）であり UUID ではないため渡さない。渡すと
  // insert が invalid input syntax for type uuid で失敗し、fireAndForget 経由で
  // 静かに握りつぶされて通知自体が作成されない（既存の event 系通知呼び出し全般に
  // 共通する制約）。
  //
  // MYPAGE-EVENT-02: PAID 自動返金対象は「要返金確認」タイトルに昇格
  // (Reservation 側の同型パターン)。返金 policy=0% で skip したケースでも同じ
  // タイトルにして admin 側の手動対応を明示的に促す。
  const notificationTitle = requiresRefund
    ? "PAID イベント申込のキャンセル — 要返金確認"
    : `イベント申込キャンセル（${channelLabel(input.channel)}）`;
  fireAndForget(
    createNotificationCommand({
      type: NOTIFICATION_TYPE.EVENT_REGISTRATION_CANCEL,
      title: notificationTitle,
      message: `${registration.name}様が「${registration.event.title}」の申込をキャンセルしました`,
      resourceType: "event",
    }),
    {
      operation: "createEventCancellationNotification",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        registrationId: input.registrationId,
        channel: input.channel,
      },
    },
  );

  // 5. AuditLog 書き込み（actor + channel + IP + UA + token fingerprint +
  //    requiresRefund / wasPaid: Reservation 側と対称）
  fireAndForget(
    createAuditLogRecord({
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: input.registrationId,
      newValue: {
        status: "CANCELLED",
        cancelledByType: CHANNEL_TO_CANCELLED_BY[input.channel],
      },
      metadata: {
        channel: input.channel,
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
        requiresRefund,
        wasPaid,
      },
    }).catch((error: unknown) => {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "auditLogEventRegistrationCancellation",
          registrationId: input.registrationId,
        },
      });
    }),
    {
      operation: "auditLogEventRegistrationCancellation",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        registrationId: input.registrationId,
        channel: input.channel,
      },
    },
  );

  // 6. FIFO 繰り上げ当選メール（cancel が CONFIRMED 由来で、空いた枠に次の
  //    WAITLISTED を昇格させた場合のみ）。
  //
  // cron の期限切れ自動昇格・管理者の手動昇格（adminPromoteWaitlistEntryAction）は
  // 昇格したら必ずオファーメールを送る契約になっている。キャンセル駆動の自動昇格
  // （`applyEventRegistrationCancellation` が同一 tx 内で呼ぶ
  // `offerNextWaitlistEntryCommand`）だけこの送信が欠けていると、繰り上げ当選者は
  // 自分が当選したことを知る手段が無いまま 24h の確定期限を迎えて無為に
  // 期限切れになる（Waitlist の主要ハッピーパスが機能しなくなる致命的な抜け穴）。
  // email が null（waitlist 登録は公開フォーム側で必須のため実運用では発生しない
  // 想定）の場合は静かに skip する（walk-in 登録が waitlist に紛れ込む異常系のみ
  // 該当し得る）。
  if (input.promoted !== null && input.promoted.email !== null) {
    const promotedRegistrationId = input.promoted.id;
    const promotedEmail = input.promoted.email;
    const promotedExpiresAt = input.promoted.expiresAt;

    fireAndForget(
      (async () => {
        const paymentContext = await getEventWaitlistOfferPaymentContext(
          promotedRegistrationId,
        );
        if (!paymentContext) {
          // 昇格させた行が直後の別操作（管理者の手動 expire 等）で消えた極端な
          // race。状態遷移自体（昇格）は既に成功しているためロールバックせず、
          // メール送信のみ諦めて非致命的にログする（冒頭の not-found ケースと
          // 同じ扱い）。
          logError(
            new Error(
              `Waitlist offer payment context not found after cancel-driven promote: registration ${promotedRegistrationId}`,
            ),
            {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.LOW,
              context: {
                operation: "applyEventRegistrationCancellationSideEffects",
                registrationId: promotedRegistrationId,
              },
            },
          );
          return;
        }

        await sendEventWaitlistOffered({
          registrationId: promotedRegistrationId,
          to: promotedEmail,
          expiresAt: promotedExpiresAt,
          paymentContext,
        });
      })(),
      {
        operation: "sendEventWaitlistOfferedOnCancelPromote",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          registrationId: input.registrationId,
          promotedRegistrationId,
          channel: input.channel,
        },
      },
    );
  }
}
