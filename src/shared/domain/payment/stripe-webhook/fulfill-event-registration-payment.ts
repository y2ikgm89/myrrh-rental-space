import "server-only";

import type Stripe from "stripe";
import { DomainError } from "@/shared/domain/domain-error";
import { confirmWaitlistOfferCommand } from "@/shared/domain/events/waitlist-commands";
import {
  claimEventRegistrationAsPaid,
  findEventRegistrationForReceiptNotify,
  findExpiredPendingWaitlistOfferRegistration,
  findWaitlistOfferRegistrationNeedingRefundAfterPaidSession,
  expireWaitlistOfferForRefundIfNeeded,
} from "@/shared/domain/events/payment-queries";
import { refundExpiredWaitlistOfferPaymentCommand } from "@/shared/domain/events/payment-commands";
import { getWaitlistConfirmationEmailDetails } from "@/shared/domain/events/waitlist-queries";
import { fireEventWaitlistConfirmedAdminNotification } from "@/shared/domain/events/waitlist-admin-notification-side-effects";
import { issueReceiptForEventRegistration } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForEventRegistration } from "@/shared/domain/receipts/notify-issued";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendEventRegistrationConfirmation } from "@/shared/domain/email/lib-dispatch";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import { invalidateEventRegistrationCache } from "./cache-invalidation";
import { resolveCheckoutSessionPaymentIntent } from "./checkout-helpers";
import { buildEventRegistrationReceiptDetailUrl } from "./receipt-detail-urls";

/**
 * Waitlist offer で返金が必要なとき PaymentIntent を解決して自動返金する。
 * @returns true = 返金経路を実行済み（呼び出し元は fulfill を skip すべき）
 */
async function refundWaitlistOfferPaymentIfNeeded(
  registrationId: string,
  session: Stripe.Checkout.Session,
  stripeClient: AsyncOnlyStripe,
): Promise<boolean> {
  const paymentIntentId = await resolveCheckoutSessionPaymentIntent(
    session,
    stripeClient,
  );
  await refundExpiredWaitlistOfferPaymentCommand({
    registrationId,
    stripePaymentIntentId: paymentIntentId,
  });
  invalidateEventRegistrationCache();
  return true;
}

/**
 * イベント申込決済完了の atomic claim + (waitlist offer のみ) 容量再チェック +
 * 確認メール + cache invalidation。
 *
 * `metadata.source === "waitlist-offer"` の場合のみ `confirmWaitlistOfferCommand`
 * を PAID 確定より先に呼ぶ（WAITLISTED_OFFERED → CONFIRMED、容量再チェック付き）。
 * 直接購入（`createEventCheckoutSessionCommand`）は登録時点で既に
 * status: CONFIRMED のため対象外 — 無条件で呼ぶと「WAITLISTED_OFFERED が
 * 見つからない」で常に DomainError(NOT_FOUND) になり、5xx→Stripe 再送の
 * 無限リトライを引き起こす。
 *
 * 履行不能（`confirmWaitlistOfferCommand` が `status: "EXPIRED"` を返す =
 * capacity race / 受付停止 / 締切超過 / イベント非公開・削除 / スロット欠落）は
 * `refundExpiredWaitlistOfferPaymentCommand` で PENDING → REFUNDED に閉じる
 * （Stripe refund + Refund 行 + AuditLog。失敗時は throw して Stripe retry）。
 */
export async function fulfillEventRegistrationPaymentAtomically(
  registrationId: string,
  session: Stripe.Checkout.Session,
  stripeClient: AsyncOnlyStripe,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const isWaitlistOffer = session.metadata?.["source"] === "waitlist-offer";

  if (isWaitlistOffer) {
    // Retry recovery: 前回 confirm で EXPIRED 化した後、dedup 再入でここに来る。
    const stuckExpiredPending =
      await findExpiredPendingWaitlistOfferRegistration(registrationId);
    if (stuckExpiredPending) {
      await refundWaitlistOfferPaymentIfNeeded(
        registrationId,
        session,
        stripeClient,
      );
      return;
    }

    let confirmResult:
      Awaited<ReturnType<typeof confirmWaitlistOfferCommand>> | undefined;
    try {
      confirmResult = await confirmWaitlistOfferCommand({
        registrationId,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof DomainError) {
        // 既に CONFIRMED 済み（webhook 再送）/ 他経路で処理済み等、想定内の状態
        // 不一致は冪等に skip する（500 にすると Stripe が無限リトライする）。
        //
        // STRIPE-01 (HIGH) fix: ここで early return すると、初回 confirm 成功→
        // 直後 claim 失敗 (DB 障害等) で Stripe が retry した際に retry 側の
        // confirm が NOT_FOUND で throw → early return → claim が二度と呼ばれず
        // paymentStatus=UNPAID/PENDING のまま焼き付く silent 会計 mismatch を
        // 引き起こす。confirmResult=undefined のまま fall through して claim を
        // 試行する (claimEventRegistrationAsPaid は status=CONFIRMED +
        // paymentStatus IN [UNPAID, PENDING] の状態でのみ flip する厳格 guard
        // 付きなので、既に PAID なら idempotent no-op、PENDING/UNPAID なら
        // 正しく PAID に flip する)。
        logError(error, {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "stripeWebhookConfirmWaitlistOffer",
            registrationId,
            sessionId: session.id,
          },
        });
        // fall through to claim recovery (confirmResult remains undefined)
      } else {
        throw error;
      }
    }

    if (confirmResult?.registration.status === "EXPIRED") {
      await refundWaitlistOfferPaymentIfNeeded(
        registrationId,
        session,
        stripeClient,
      );
      return;
    }

    if (!confirmResult || confirmResult.registration.status !== "CONFIRMED") {
      const needingRefund =
        await findWaitlistOfferRegistrationNeedingRefundAfterPaidSession(
          registrationId,
        );
      if (needingRefund) {
        await expireWaitlistOfferForRefundIfNeeded(registrationId);
        await refundWaitlistOfferPaymentIfNeeded(
          registrationId,
          session,
          stripeClient,
        );
        return;
      }
    }
  }

  const claimed = await claimEventRegistrationAsPaid(registrationId, {
    stripePaymentIntentId: paymentIntentId,
  });
  if (!claimed) return;

  invalidateEventRegistrationCache();

  // 領収書 (Receipt) の atomic 採番・発行を await で実行する (reservation 側と同型)。
  // - fireAndForget 禁止 (silent failure 防止、Foundation gap analysis 契約)
  // - VALIDATION エラー (金額 0 / paymentStatus mismatch 等) は logError で握り潰し
  // - それ以外 (DB 一時障害 等) は throw して Stripe の retry に委ねる
  // - 冪等契約 (@unique(eventRegistrationId) + advisory lock 728353) で at-least-once 安全
  //
  // STRIPE-03 backstop: reservation 側と同型で、claim* 成功→issueReceipt* 恒久 throw の
  // 場合 (Stripe retry でも回復しない DB 障害等) は `/api/cron/receipt-backfill` が
  // event registration 側の orphan (paymentStatus IN [PAID, PARTIALLY_REFUNDED] AND
  // receipt: null) を毎時走査して発行を再試行する (`backfillReceipts` の
  // `registrationRows` 経路)。
  //
  // 領収書顧客通知は発行通知メール (`notifyReceiptIssuedFor*`) に集約。確認メールへ
  // receiptSerialNo を渡さない（直接購入で確認メール skip でも発行通知は送る）。
  let issuedReceipt: { id: string; serialNo: string } | undefined;
  try {
    // OBS-02: source を明示指定 (reservation 側と同型)。
    issuedReceipt = await issueReceiptForEventRegistration(registrationId, {
      source: "stripe-webhook",
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "issueReceiptForEventRegistration",
          registrationId,
        },
      });
    } else {
      throw error;
    }
  }

  if (issuedReceipt) {
    const notifyTarget =
      await findEventRegistrationForReceiptNotify(registrationId);
    fireAndForget(
      notifyReceiptIssuedForEventRegistration({
        receiptId: issuedReceipt.id,
        detailUrl: buildEventRegistrationReceiptDetailUrl({
          id: registrationId,
          customerId: notifyTarget?.customerId ?? null,
        }),
      }),
      {
        operation: "notifyReceiptIssuedForEventRegistration",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          registrationId,
          receiptId: issuedReceipt.id,
        },
      },
    );
  }

  if (!isWaitlistOffer) return;

  // 直接購入は `createEventRegistrationCommand` が登録直後に確認メールを
  // 送信済みのため、ここで再送すると二重送信になる（送らない）。waitlist offer は
  // WAITLISTED 登録時に「順番待ち登録受付」メールのみ送っており、CONFIRMED
  // 化した今回が初めての「確定」通知になる。details lookup は await し、
  // 実送信のみ fireAndForget する（Reservation 側の `fulfillPaymentAtomically`
  // と同じ「呼出式を直接渡す」形。async IIFE でラップすると details 取得の完了を
  // テストから observe しづらくなるため避ける）。
  const details = await getWaitlistConfirmationEmailDetails(registrationId);
  if (!details) return;

  fireAndForget(
    (async () => {
      const renderContext = await getEventEmailRenderContext();
      return sendEventRegistrationConfirmation(
        {
          registrationId: details.id,
          customerName: details.name,
          customerEmail: details.email,
          eventTitle: details.eventTitle,
          eventStartTime: details.startTime,
          eventEndTime: details.endTime,
          location: details.location ?? undefined,
          quantity: details.quantity,
          icsSequence: details.icsSequence,
          customerId: details.customerId,
          format: details.format,
          meetingUrl: details.meetingUrl,
        },
        renderContext,
      );
    })(),
    {
      operation: "sendWaitlistOfferPaymentConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { registrationId },
    },
  );

  fireEventWaitlistConfirmedAdminNotification(registrationId);
}
