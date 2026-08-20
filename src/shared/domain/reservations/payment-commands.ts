import "server-only";

import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getAppUrl } from "@/shared/lib/constants";
import { retrieveCheckoutSessionStatus } from "@/shared/domain/payment/checkout-session-expiry";
import { runCheckoutSessionCreateCommand } from "@/shared/domain/payment/checkout-session-create-orchestration";
import { issueManualPaymentReceiptBestEffort } from "@/shared/domain/payment/manual-payment-receipt-orchestration";
import {
  runAdminPaymentRefundCommand,
  runAmountMismatchRefundCommand,
  runOrphanCancelRefundCommand,
} from "@/shared/domain/payment/payment-refund-command-orchestration";
import { PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT } from "@/shared/domain/payment/payment-status-guards";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { PENDING_RESERVATION_EXPIRY_MINUTES } from "@/shared/domain/reservations/pending-expiry";
import { type RefundedByType } from "@/shared/lib/validations/enums/refund-attribution";
import { issueReceiptForReservation } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForReservation } from "@/shared/domain/receipts/notify-issued";
import {
  createStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";

// ---------------------------------------------------------------------------
// Checkout Session
// ---------------------------------------------------------------------------

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

  return runCheckoutSessionCreateCommand({
    updateMany: (args) => prisma.reservation.updateMany(args),
    entityId: reservationId,
    extraWhere: { deletedAt: null },
    claimWhere: {
      id: reservationId,
      deletedAt: null,
      paymentStatus: {
        in: [...PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT],
      },
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
    },
    // `paymentInitiatedAt` は fail-safe cron の cutoff 判定 SSoT。
    // `stripePaymentIntentId` は現在試行の ID なので再決済開始時に捨てる。
    buildClaimData: (claimedAt) => ({
      paymentStatus: PaymentStatus.PENDING,
      paymentInitiatedAt: claimedAt,
      stripePaymentIntentId: null,
    }),
    claimConflictMessage:
      "この予約は別のリクエストで既に決済処理が開始されています",
    reRead: () =>
      prisma.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          totalPriceWithTax: true,
          guestEmail: true,
          space: { select: { name: true } },
          customer: { select: { email: true } },
        },
      }),
    validateAuthoritative: (row) => {
      if (
        !row ||
        row.totalPriceWithTax === null ||
        row.totalPriceWithTax <= 0
      ) {
        return {
          ok: false,
          message: "料金が設定されていない予約は決済できません",
        };
      }
      return { ok: true, row };
    },
    buildSessionSpec: ({ currency, appUrl, claimedAt, authoritative }) => {
      const expiresAt =
        Math.floor(claimedAt.getTime() / 1000) +
        PENDING_RESERVATION_EXPIRY_MINUTES * 60;
      return {
        lineItems: [
          {
            name: `予約: ${authoritative.space.name}`,
            unitAmount: toStripeUnitAmount(
              authoritative.totalPriceWithTax,
              currency,
            ),
            quantity: 1,
          },
        ],
        metadata: { reservationId },
        customerEmail: authoritative.guestEmail ?? authoritative.customer.email,
        expiresAt,
        successUrl: `${appUrl}/mypage/reservations/${reservationId}?payment=success`,
        cancelUrl: `${appUrl}/mypage/reservations/${reservationId}?payment=cancelled`,
        // key は payload と一緒に動かす。`expires_at` は claim 時刻由来なので
        // 予約 ID 固定だと 24h 以内の再試行が idempotency_error になる。
        idempotencyKey: `checkout/reservation/${reservationId}/${String(expiresAt)}`,
      };
    },
    operation: "createCheckoutSessionCommand",
    createFailureOperation: "createCheckoutSession",
    logContext: { reservationId },
    settleConflictMessage: "この予約は既に決済が完了しています",
    toResult: (session) => ({
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: reservation.customerId,
    }),
  });
}

/**
 * 管理者による手動入金記録。UNPAID → PAID の遷移を、Stripe を経由しない支払い
 * （現金・銀行振込等）について事後記録する。`createCheckoutSessionCommand` と同じ
 * updateMany WHERE claim パターンで二重確定を防ぐ。`paymentStatus` が UNPAID / FAILED
 * かつ Stripe Checkout が進行中 (session status=open) でない予約のみ対象。
 * session id が残っていても expired / complete なら手動入金可（claim 時に session id を null 化）。
 *
 * claim は `status in [PENDING, CONFIRMED]` も要求する (cancel 経路は paymentStatus
 * を触らず status のみ CANCELLED に遷移させるため、paymentStatus だけで claim すると
 * CANCELLED + UNPAID な予約を PAID に格上げできてしまう)。
 *
 * 入金額は Stripe Checkout / 領収書と同じ charge base（`totalPriceWithTax` が
 * populate されていれば税込合計、未設定なら `totalPrice`）と一致することを要求する。
 * 受領額自体は Reservation 列には保存せず AuditLog metadata にのみ記録する
 * (events の method/note と同型)。
 *
 * claim 成功後は `issueReceiptForReservation` を await し、成功時のみ
 * `notifyReceiptIssuedForReservation` を fire-and-forget する。領収書失敗でも
 * PAID は維持し、`receiptWarning` で admin UI に部分失敗を返す
 * （backfill cron が orphan を救済）。
 */
export type ManualReservationPaymentResult = {
  reservationId: string;
  customerId: string;
  /**
   * PAID は確定したが領収書発行をスキップ / 延期したときの管理者向け警告。
   * MutationResult 成功ペイロードとして透過する。
   */
  receiptWarning?: string;
};

function buildReservationReceiptDetailUrl(input: {
  reservationId: string;
  userId: string | null;
}): string {
  const appUrl = getAppUrl();
  if (input.userId !== null) {
    return `${appUrl}/mypage/reservations/${input.reservationId}`;
  }
  const token = createStatusToken(
    input.reservationId,
    new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/reservation/status?token=${token}`;
}

async function assertManualPaymentNotBlockedByOpenCheckout(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  const sessionStatus = await retrieveCheckoutSessionStatus(input.sessionId);
  if (sessionStatus === null) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }
  if (sessionStatus === "open") {
    throw new DomainError(
      "Stripe決済が進行中のため、手動入金記録できません",
      "VALIDATION",
    );
  }
}

export async function recordManualReservationPaymentCommand(data: {
  reservationId: string;
  amount: number;
}): Promise<ManualReservationPaymentResult> {
  const existing = await prisma.reservation.findUnique({
    where: { id: data.reservationId, deletedAt: null },
    select: {
      customerId: true,
      userId: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      totalPrice: true,
      totalPriceWithTax: true,
    },
  });
  if (!existing) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (
    existing.paymentStatus !== PaymentStatus.UNPAID &&
    existing.paymentStatus !== PaymentStatus.FAILED
  ) {
    throw new DomainError(
      "この予約はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "VALIDATION",
    );
  }
  if (existing.stripeCheckoutSessionId !== null) {
    await assertManualPaymentNotBlockedByOpenCheckout({
      reservationId: data.reservationId,
      sessionId: existing.stripeCheckoutSessionId,
    });
  }

  const chargeBase = existing.totalPriceWithTax ?? existing.totalPrice;
  if (chargeBase === null || chargeBase <= 0) {
    throw new DomainError(
      "料金が設定されていない予約は手動入金記録できません",
      "VALIDATION",
    );
  }
  if (data.amount !== chargeBase) {
    throw new DomainError(
      `入金額は${chargeBase}円と一致する必要があります`,
      "VALIDATION",
    );
  }

  const claimed = await prisma.reservation.updateMany({
    where: {
      id: data.reservationId,
      deletedAt: null,
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
      paymentStatus: {
        in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
      },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      paidAt: new Date(),
      stripeCheckoutSessionId: null,
    },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この予約はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "CONFLICT",
    );
  }

  const receiptWarning = await issueManualPaymentReceiptBestEffort({
    issue: () =>
      issueReceiptForReservation(data.reservationId, {
        source: "manual-payment",
      }),
    notify: (receiptId) =>
      notifyReceiptIssuedForReservation({
        receiptId,
        detailUrl: buildReservationReceiptDetailUrl({
          reservationId: data.reservationId,
          userId: existing.userId,
        }),
      }),
    issueOperation: "issueReceiptForReservation",
    notifyOperation: "notifyReceiptIssuedForReservation",
    logContext: { reservationId: data.reservationId },
  });

  return {
    reservationId: data.reservationId,
    customerId: existing.customerId,
    ...(receiptWarning !== undefined ? { receiptWarning } : {}),
  };
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export interface RefundReservationInput {
  reservationId: string;
  /**
   * 部分返金額 (円、正整数)。未指定なら残額全額 (totalPrice - Σrefunds.amount)。
   * `1 <= amount <= remaining` を violation すると VALIDATION エラー。
   */
  amount?: number;
  /**
   * 管理者入力の理由。Refund.reason に保存し、AuditLog metadata・顧客通知メール文面
   * (task #9 PR#4 で連動) にも流す。
   */
  reason?: string;
  /**
   * 「誰が」返金を主導したか。DB 側 CHECK 制約 `refunds_refundedByType_check` と
   * application 側 helper (`REFUNDED_BY_TYPE`) の両方で強制する二重防御の一部。
   */
  actorType: RefundedByType;
  /**
   * AuditLog.userId に書く。ADMIN 経路は admin userId、AUTO_ON_CANCEL では null (system 起動)。
   */
  actorUserId?: string;
  /**
   * UA-HORIZ-04: リクエスト由来のフォレンジック context。admin action は
   * `buildAuditRequestContext()` から取得して渡す。AUTO_ON_CANCEL / webhook 経路は
   * `undefined` で呼び出し可 (metadata に ip/userAgent キーは付かない)。
   */
  request?: { ip: string | null; userAgent: string | null };
}

export interface RefundReservationResult {
  refundId: string;
  status: string | null;
  customerId: string;
  /**
   * Stripe が返金を確定 (`status === "succeeded"`) した時点で到達する paymentStatus。
   * `isSettled: false` の間はまだ DB の paymentStatus には反映されていない
   * (konbini / customer_balance 等の非同期経路。refund.updated webhook が
   * 確定後に反映する)。
   */
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
  /** true = 今回 Stripe が同期的に確定済み (paymentStatus 反映・返金完了メール送信可)。 */
  isSettled: boolean;
  /** 累積返金額 (今回の refund を含めた合計、円) */
  cumulativeAmount: number;
  /** 今回 refund した金額 (円) */
  refundAmount: number;
}

/**
 * Reservation の返金 (部分返金対応、Stripe idempotent、Refund child table + AuditLog 書込)。
 *
 * ## 契約
 * - `paymentStatus` が `PAID` または `PARTIALLY_REFUNDED` の予約のみ返金可能
 * - `amount` 未指定 → 残額全額 (`totalPrice - Σ既 refunds.amount`)
 * - 累積返金額が `totalPrice` (charge 額) に到達したら `REFUNDED`、未満なら `PARTIALLY_REFUNDED`
 * - Stripe idempotency key = `reservation-refund-{reservationId}-{newCumulative}-{excludedAttemptCount}`。
 *   部分返金は newCumulative で分かれ、failed/canceled 後の同額再試行は除外件数で
 *   分かれる。同一試行の network retry は件数が増えないのでキーは据え置き。
 *
 * ## 並行制御
 * - Phase A/C: `pg_advisory_xact_lock` で同一予約の refund を直列化 (over-refund 防止)
 * - Phase B: Stripe API は tx 外 (Prisma 公式推奨)。Phase C で累積額を再検証して persist
 * - Phase B 成功・Phase C 失敗時は webhook (`charge.refunded`) が `stripeRefundId` で救済
 *
 * ## Belt-and-suspenders
 * - Stripe refund 成功後、`Refund.stripeRefundId @unique` により二重 insert は DB 側で reject。
 *   webhook (charge.refunded) が同一 stripeRefundId を先に書いた場合は skip (idempotent)。
 *
 * @throws DomainError NOT_FOUND / VALIDATION / UNEXPECTED
 */
export async function refundReservationPaymentCommand(
  input: RefundReservationInput,
): Promise<RefundReservationResult> {
  const {
    reservationId,
    amount: requestedAmount,
    reason,
    actorType,
    actorUserId,
    request,
  } = input;

  return runAdminPaymentRefundCommand({
    kind: "reservation",
    entityId: reservationId,
    ...(requestedAmount !== undefined ? { requestedAmount } : {}),
    ...(reason !== undefined ? { reason } : {}),
    actorType,
    ...(actorUserId !== undefined ? { actorUserId } : {}),
    ...(request !== undefined ? { request } : {}),
    operation: "refundReservationPayment",
    logContext: { reservationId },
    resource: "reservation",
    savepointName: "refund_create_reservation",
    idempotencyPrefix: "reservation-refund",
    messages: {
      notFound: "予約が見つかりません",
      notRefundable: "支払い済み・一部返金済みの予約のみ返金できます",
      missingCharge: "料金が設定されていない予約は返金できません",
      fullyRefunded: "この予約は既に全額返金済みです",
    },
    refundFk: { reservationId },
    findEntity: async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          totalPriceWithTax: true,
        },
      });
      if (!reservation) return null;
      return {
        paymentStatus: reservation.paymentStatus,
        stripePaymentIntentId: reservation.stripePaymentIntentId,
        chargeTotal: reservation.totalPriceWithTax,
        extra: { customerId: reservation.customerId },
      };
    },
    persistPaymentStatus: async (tx, newStatus) => {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          paymentStatus: {
            in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
          },
        },
        data: { paymentStatus: newStatus },
      });
    },
  });
}

/**
 * Stripe 決済が「キャンセル済み予約」に対して成立してしまった orphan を自動返金し、
 * `paymentStatus=REFUNDED` に収束させる（idempotent）。
 *
 * `refundReservationPaymentCommand` は PAID / PARTIALLY_REFUNDED 前提のため直接は使えない。
 * claim 前提の webhook race を想定し、`paymentStatus=PENDING/UNPAID` でも実行できる。
 */
export async function refundOrphanedStripePaymentForCancelledReservation(input: {
  reservationId: string;
  /**
   * webhook payload 由来の PaymentIntent ID。DB 未保存でも可（このコマンドが保存する）。
   */
  stripePaymentIntentId: string;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    reservationId,
    stripePaymentIntentId,
    reason = "キャンセル済み予約への決済成立に伴う自動返金",
  } = input;

  return runOrphanCancelRefundCommand({
    kind: "reservation",
    entityId: reservationId,
    stripePaymentIntentId,
    reason,
    operation: "refundOrphanedStripePaymentForCancelledReservation",
    logContext: { reservationId },
    resource: "reservation",
    savepointName: "refund_create_auto_on_cancel",
    idempotencyKey: (chargeTotal) =>
      `reservation-refund-${reservationId}-${chargeTotal}`,
    refundFk: { reservationId },
    inspectEntity: async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          status: true,
          paymentStatus: true,
          totalPriceWithTax: true,
        },
      });

      if (!reservation) {
        return { action: "not_applicable" };
      }
      if (reservation.paymentStatus === PaymentStatus.REFUNDED) {
        return { action: "already_refunded" };
      }
      if (reservation.status !== ReservationStatus.CANCELLED) {
        return { action: "not_applicable" };
      }
      if (
        reservation.totalPriceWithTax === null ||
        reservation.totalPriceWithTax <= 0
      ) {
        return { action: "not_applicable" };
      }
      return { action: "continue", chargeTotal: reservation.totalPriceWithTax };
    },
    markAlreadyRefunded: async (tx, paymentIntentId) => {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          status: ReservationStatus.CANCELLED,
          paymentStatus: { not: PaymentStatus.REFUNDED },
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId: paymentIntentId,
        },
      });
    },
    persistSettledRefund: async (tx, paymentIntentId) => {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          status: ReservationStatus.CANCELLED,
          paymentStatus: { not: PaymentStatus.REFUNDED },
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId: paymentIntentId,
          paidAt: new Date(),
        },
      });
    },
  });
}

/**
 * Checkout Session の amount_total が DB 期待額と不一致のため fulfill できなかった
 * captured payment を自動返金し `paymentStatus=REFUNDED` に収束させる（idempotent）。
 */
export async function refundCheckoutAmountMismatchForReservation(input: {
  reservationId: string;
  stripePaymentIntentId: string;
  capturedAppAmount: number;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    reservationId,
    stripePaymentIntentId,
    capturedAppAmount,
    reason = "Checkout 金額不一致のための自動返金",
  } = input;

  return runAmountMismatchRefundCommand({
    kind: "reservation",
    entityId: reservationId,
    stripePaymentIntentId,
    capturedAppAmount,
    reason,
    operation: "refundCheckoutAmountMismatchForReservation",
    logContext: { reservationId },
    resource: "reservation",
    savepointName: "refund_create_amount_mismatch",
    idempotencyKey: `reservation-amount-mismatch-refund-${reservationId}`,
    refundFk: { reservationId },
    inspectEntity: async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          status: true,
          paymentStatus: true,
        },
      });

      if (!reservation) {
        return { action: "not_applicable" };
      }
      if (reservation.paymentStatus === PaymentStatus.REFUNDED) {
        return { action: "already_refunded" };
      }
      if (
        reservation.status !== ReservationStatus.PENDING &&
        reservation.status !== ReservationStatus.CONFIRMED
      ) {
        return { action: "not_applicable" };
      }
      if (
        reservation.paymentStatus !== PaymentStatus.UNPAID &&
        reservation.paymentStatus !== PaymentStatus.PENDING
      ) {
        return { action: "not_applicable" };
      }
      return { action: "continue" };
    },
    persistSettledRefund: async (tx) => {
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: {
            in: [PaymentStatus.UNPAID, PaymentStatus.PENDING],
          },
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId,
        },
      });
    },
  });
}
