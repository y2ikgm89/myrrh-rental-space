import "server-only";

import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildRevertCheckoutPendingAdapter,
  orchestrateCheckoutSessionCreate,
  resolveCheckoutStripeContext,
} from "@/shared/domain/payment/checkout-session-create-orchestration";
import {
  revertCheckoutPendingToUnpaid,
  settleCheckoutSessionWrite,
} from "@/shared/domain/payment/checkout-session-write-orchestration";
import { PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT } from "@/shared/domain/payment/payment-status-guards";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES } from "@/shared/domain/events/payment-expiry-constants";

/**
 * EventRegistration の Stripe Checkout Session を作成する (PR#10)。
 *
 * ## イベントチケットの税
 *
 * チケット `price` は**税込固定** (Settings の税率設定は予約スペース料金に適用。
 * イベント申込は ticket.price をそのまま Stripe / paidAmount / 領収書 SSoT に使う)。
 * 領収書発行 (`issueReceiptForEventRegistration`) は paidAmount から **10% 内税固定**
 * で税額を逆算する (Reservation の rateBreakdown とは別経路)。
 *
 * Reservation 側の createCheckoutSessionCommand と同型の設計:
 * - actor assertion (IDOR 防止)
 * - claim-first (Stripe API 呼出の前に UNPAID → PENDING を atomic に確定)
 * - claim 直後に authoritative な ticket.price / 顧客情報を再読み込み
 * - Stripe 失敗時は PENDING → UNPAID revert
 * - session settle は WHERE notIn [PAID, PARTIALLY_REFUNDED, REFUNDED] + PENDING 再 assert
 * - settle count=0 (異常に速い webhook / manual refund) は session expire + CONFLICT
 * - create/write 失敗時は orphan session を best-effort expire して UNPAID revert
 *
 * `actorCustomerId`:
 * - `null` = admin 経路 (本人性検証 bypass)
 * - `string` = 公開経路 (Better Auth Customer.id、本人の申込のみ許可)
 *
 * Codex Cloud Review P1 (PR#1026, comment_id=3567019751): pre-check と claim
 * `updateMany.where` の両方で `status: CONFIRMED` を要求する。cancel 経路
 * (registration-cancel-core.ts) は paymentStatus を触らず status のみ CANCELLED
 * に遷移させるため、paymentStatus だけで gate すると CANCELLED + UNPAID を
 * PENDING に格上げして live Stripe session URL を返す silent bug が発生する。
 */
export async function createEventCheckoutSessionCommand(input: {
  registrationId: string;
  actorCustomerId: string | null;
}) {
  const { registrationId, actorCustomerId } = input;

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      customerId: true,
      email: true,
      name: true,
      quantity: true,
      status: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      ticket: { select: { name: true, price: true } },
      event: { select: { title: true } },
    },
  });

  if (!registration) {
    throw new DomainError("イベント申込が見つかりません", "NOT_FOUND");
  }

  if (actorCustomerId !== null && actorCustomerId !== registration.customerId) {
    throw new DomainError(
      "この申込の決済を開始する権限がありません",
      "FORBIDDEN",
    );
  }

  if (registration.status !== RegistrationStatus.CONFIRMED) {
    throw new DomainError(
      "この申込はキャンセル済み等のため決済できません",
      "VALIDATION",
    );
  }

  // FAILED も再 checkout 可（Reservation / waitlist offer と同型）。UI は FAILED
  // で CheckoutButton を出すため、UNPAID のみだと再試行が常に失敗する。
  if (
    registration.paymentStatus !== PaymentStatus.UNPAID &&
    registration.paymentStatus !== PaymentStatus.FAILED
  ) {
    throw new DomainError(
      "この申込は既に決済処理が開始されています",
      "VALIDATION",
    );
  }

  const totalAmount = registration.ticket.price * registration.quantity;
  if (totalAmount <= 0) {
    throw new DomainError("無料チケットは決済できません", "VALIDATION");
  }

  const stripeContext = await resolveCheckoutStripeContext();
  const { currency, paymentMethodTypes, appUrl } = stripeContext;

  // Claim-first: UNPAID/FAILED → PENDING を atomic に確定 (edit / 並行 cancel /
  // FAILED 再試行との race を封鎖)。`status: CONFIRMED` も WHERE で assert する
  // (Codex P1 #1026, comment 3567019751): pre-check と claim の間で並行 cancel が
  // 走ったケースを DB レベルで塞ぐ。
  const claimedAt = new Date();
  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: { in: [...PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT] },
    },
    data: { paymentStatus: PaymentStatus.PENDING },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この申込は別のリクエストで既に決済処理が開始されています",
      "CONFLICT",
    );
  }

  // Authoritative re-read (直前の edit を反映)。
  // Codex P1 (PR#1026, comment 3567019753): return URL に event.slug が必要なので
  // select に追加する (旧実装は `/events/registrations/{id}` を指し、存在しない
  // ルートなので Stripe returnee が 404 する silent bug だった)。
  const authoritative = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      email: true,
      name: true,
      quantity: true,
      ticket: { select: { name: true, price: true } },
      event: { select: { title: true, slug: true } },
    },
  });

  if (!authoritative || authoritative.ticket.price <= 0) {
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.eventRegistration.updateMany(args),
      { entityId: registrationId },
    );
    throw new DomainError("チケット料金が設定されていません", "VALIDATION");
  }

  const authoritativeTotal =
    authoritative.ticket.price * authoritative.quantity;

  return orchestrateCheckoutSessionCreate({
    operation: "createEventCheckoutSessionCommand",
    stripeContext,
    expireContext: { registrationId },
    conflictMessage: "この申込は既に決済が完了しています",
    revertPending: buildRevertCheckoutPendingAdapter(
      (args) => prisma.eventRegistration.updateMany(args),
      registrationId,
    ),
    buildSessionParams: () => ({
      mode: "payment" as const,
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `${authoritative.event.title} — ${authoritative.ticket.name}`,
            },
            unit_amount: toStripeUnitAmount(
              authoritative.ticket.price,
              currency,
            ),
          },
          quantity: authoritative.quantity,
        },
      ],
      metadata: {
        type: "event-registration",
        registrationId,
      },
      ...(authoritative.email ? { customer_email: authoritative.email } : {}),
      expires_at:
        Math.floor(claimedAt.getTime() / 1000) +
        UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES * 60,
      success_url: `${appUrl}/events/registrations/payment-result?payment=success&registration=${registrationId}&slug=${encodeURIComponent(authoritative.event.slug)}`,
      cancel_url: `${appUrl}/events/registrations/payment-result?payment=cancelled&registration=${registrationId}&slug=${encodeURIComponent(authoritative.event.slug)}`,
    }),
    settleSession: (sessionId) =>
      settleCheckoutSessionWrite(
        (args) => prisma.eventRegistration.updateMany(args),
        {
          entityId: registrationId,
          sessionId,
          extraData: { paidAmount: authoritativeTotal },
        },
      ),
    buildSuccessResult: (session) => ({
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: registration.customerId,
    }),
  });
}
