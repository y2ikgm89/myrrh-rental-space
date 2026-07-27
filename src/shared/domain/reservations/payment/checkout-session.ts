import "server-only";

import {
  PaymentStatus,
  ReservationStatus,
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
import { PENDING_RESERVATION_EXPIRY_MINUTES } from "@/shared/domain/reservations/pending-expiry";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";

/**
 * Stripe Checkout Session を作成する。
 *
 * `actorCustomerId`:
 * - `null` = admin 経路（本人性検証を bypass、SUPER_ADMIN の代理決済 UI 用）
 * - `string` = 公開経路（Better Auth 認証済み Customer の id、本人の予約のみ許可）
 *
 * 本人性検証は「reservationId のみで session を作れる」IDOR を封じるためのガード。
 * mismatch は DomainError(FORBIDDEN) を throw する。
 */
export async function createCheckoutSessionCommand(input: {
  reservationId: string;
  actorCustomerId: string | null;
}) {
  const { reservationId, actorCustomerId } = input;
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      status: true,
      totalPrice: true,
      paymentStatus: true,
      guestEmail: true,
      stripeCheckoutSessionId: true,
      space: { select: { name: true } },
      customer: { select: { email: true, lastName: true, firstName: true } },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (actorCustomerId !== null && actorCustomerId !== reservation.customerId) {
    // 他人の予約 id で checkout session を作ろうとする IDOR を封鎖。
    // 存在しない予約と同じ NOT_FOUND を返さないのは意図的で、admin と紛らわしい
    // FORBIDDEN を明示することで運用側の切り分けを容易にする（reservation 自体は
    // 実在するので NOT_FOUND は誤り）。
    throw new DomainError(
      "この予約の決済を開始する権限がありません",
      "FORBIDDEN",
    );
  }

  // Codex Cloud Review P1 (PR #1022, comment 3566965666):
  // cancel path は status=CANCELLED に遷移させるが paymentStatus は UNPAID の
  // まま残す。ここで status を assert しないと、キャンセル済み予約の owner が
  // マイページから決済を開始でき、webhook 経由で status=CANCELLED /
  // paymentStatus=PAID の不整合ペアが焼き付く。COMPLETED / NO_SHOW も同様に
  // billable 状態ではない。決済導線に入れるのは PENDING / CONFIRMED のみ。
  if (
    reservation.status !== ReservationStatus.PENDING &&
    reservation.status !== ReservationStatus.CONFIRMED
  ) {
    throw new DomainError("キャンセル済みの予約は決済できません", "VALIDATION");
  }

  // 再決済許容ステータス: UNPAID (未着手) と FAILED (前回失敗)。
  // FAILED は checkout.session.expired webhook 経由で claimReservationAsFailed が
  // 打った終端気味の状態だが、顧客が再度支払える経路を残さないと「一度離脱すると
  // マイページから決済再開できない」体験になり、admin の手作業リセット必須になる。
  // 下段の atomic claim (updateMany WHERE paymentStatus IN [UNPAID, FAILED]) と
  // 整合させて FAILED→PENDING の巻き戻しを明示的に許可する。
  // PENDING (別 request が進行中) / PAID (完了) / REFUNDED (返金済) は引き続き拒否。
  if (
    reservation.paymentStatus !== PaymentStatus.UNPAID &&
    reservation.paymentStatus !== PaymentStatus.FAILED
  ) {
    throw new DomainError(
      "この予約は既に決済処理が開始されています",
      "VALIDATION",
    );
  }

  if (reservation.totalPrice === null || reservation.totalPrice <= 0) {
    throw new DomainError(
      "料金が設定されていない予約は決済できません",
      "VALIDATION",
    );
  }

  const stripeContext = await resolveCheckoutStripeContext();
  const { currency, paymentMethodTypes, appUrl } = stripeContext;

  // Race-free claim: 「Stripe session を作る前」に UNPAID → PENDING を atomic に確定する。
  //
  // 旧実装は Stripe session 作成 → paymentStatus 更新 の順で、以下の race を起こしていた
  // (Codex Cloud Review P1, PR#1016):
  //
  //   1. checkout が UNPAID + totalPrice=1000 を読む
  //   2. edit が UNPAID を確認 & updateMany で totalPrice=2000 に変更 (成功)
  //   3. checkout が Stripe session を **totalPrice=1000** で作成
  //   4. checkout が paymentStatus=PENDING + sessionId 書込
  //   → Stripe セッションの金額 (1000) と reservation の金額 (2000) が乖離、
  //      顧客は旧金額で決済 → 差額の回収不能な会計 mismatch
  //
  // 修正: (a) claim を先に打つ → 以降 edit の updateMany (WHERE UNPAID) が count=0
  // で rollback される、(b) claim 直後に authoritative な totalPrice を再読み込みして
  // Stripe に渡す (直前の edit を反映)、(c) Stripe 失敗時は UNPAID に revert して
  // stuck state を残さない。
  //
  // `paymentInitiatedAt` は fail-safe cron (`pending-reservation-expire`) が
  // `PENDING_RESERVATION_EXPIRY_MINUTES` の cutoff 判定に使う SSoT。ここで now を
  // 書き込むことで、予約作成から時間をおいて checkout を開始したケース
  // (createdAt < cutoff だが checkout はまだ生きている) の誤爆を防ぎ、
  // FAILED → PENDING の再 checkout でも refresh される (Codex P1: PR#1042)。
  const claimedAt = new Date();
  const claimed = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      // 再決済許容: UNPAID (未着手) と FAILED (前回失敗) の両方から PENDING に
      // 遷移する。上段の gate と対称化して claim の race を防ぐ。
      paymentStatus: {
        in: [...PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT],
      },
      // Codex P1 (PR #1022): 初期 findUnique と claim の間で並行 cancel が
      // 走ったケースを DB レベルで塞ぐ。status が active でなければ count=0 → CONFLICT。
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
    },
    data: {
      paymentStatus: PaymentStatus.PENDING,
      paymentInitiatedAt: claimedAt,
    },
  });
  if (claimed.count === 0) {
    // 別 request (別 checkout / 手動 admin refund / 並行 cancel) が先に状態を遷移させた。
    throw new DomainError(
      "この予約は別のリクエストで既に決済処理が開始されています",
      "CONFLICT",
    );
  }

  // Claim 成功後の authoritative な reservation を再読み込みする。
  // - totalPriceWithTax: 領収書 (Receipt.amount) と同 SSoT の税込合計を Stripe に渡す
  // - customer/space/email: edit で顧客差替や guestEmail 変更があった場合も追随
  const authoritative = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      totalPriceWithTax: true,
      guestEmail: true,
      space: { select: { name: true } },
      customer: { select: { email: true } },
    },
  });

  if (
    !authoritative ||
    authoritative.totalPriceWithTax === null ||
    authoritative.totalPriceWithTax <= 0
  ) {
    // 「claim 済みだが金額が消えた」異常状態。UNPAID に revert して stuck state を解消。
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.reservation.updateMany(args),
      { entityId: reservationId, extraWhere: { deletedAt: null } },
    );
    throw new DomainError(
      "料金が設定されていない予約は決済できません",
      "VALIDATION",
    );
  }

  const authoritativeTotalPriceWithTax = authoritative.totalPriceWithTax;

  return orchestrateCheckoutSessionCreate({
    operation: "createCheckoutSessionCommand",
    stripeContext,
    expireContext: { reservationId },
    conflictMessage: "この予約は既に決済が完了しています",
    revertPending: buildRevertCheckoutPendingAdapter(
      (args) => prisma.reservation.updateMany(args),
      reservationId,
      { deletedAt: null },
    ),
    buildSessionParams: () => ({
      mode: "payment" as const,
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `予約: ${authoritative.space.name}`,
            },
            unit_amount: toStripeUnitAmount(
              authoritativeTotalPriceWithTax,
              currency,
            ),
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservationId,
      },
      customer_email: authoritative.guestEmail ?? authoritative.customer.email,
      expires_at:
        Math.floor(claimedAt.getTime() / 1000) +
        PENDING_RESERVATION_EXPIRY_MINUTES * 60,
      success_url: `${appUrl}/mypage/reservations/${reservationId}?payment=success`,
      cancel_url: `${appUrl}/mypage/reservations/${reservationId}?payment=cancelled`,
    }),
    settleSession: (sessionId) =>
      settleCheckoutSessionWrite(
        (args) => prisma.reservation.updateMany(args),
        {
          entityId: reservationId,
          sessionId,
          extraWhere: { deletedAt: null },
        },
      ),
    buildSuccessResult: (session) => ({
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: reservation.customerId,
    }),
  });
}
