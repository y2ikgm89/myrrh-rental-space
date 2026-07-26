import "server-only";

import {
  AuditAction,
  PaymentStatus,
  ReservationStatus,
} from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  assertOnlinePaymentAvailable,
  assertStripeCredentialsConfigured,
} from "@/shared/domain/payment/availability";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getStripeClient } from "@/shared/lib/stripe";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import { getAppUrl } from "@/shared/lib/constants";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import {
  findPaymentMethodsIncompatibleWithCurrency,
  isStripePaymentMethodType,
} from "@/shared/lib/stripe-payment-methods";
import {
  expireOpenCheckoutSessionBestEffort,
  retrieveCheckoutSessionStatus,
} from "@/shared/domain/reservations/checkout-session-expiry";
import { PENDING_RESERVATION_EXPIRY_MINUTES } from "@/shared/domain/reservations/pending-expiry";
import {
  REFUNDED_BY_TYPE,
  type RefundedByType,
} from "@/shared/lib/validations/enums/refund-attribution";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { issueReceiptForReservation } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForReservation } from "@/shared/domain/receipts/notify-issued";
import {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} from "@/shared/domain/receipts/manual-payment-warnings";
import {
  createStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";

/**
 * `refundReservationPaymentCommand` の advisory lock namespace。
 * `.claude/rules/db-domain.md` の registry と一致 (単一予約単位の concurrent refund 直列化)。
 */
const REFUND_LOCK_NAMESPACE = 728355;

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

  const stripeSettings = await assertOnlinePaymentAvailable();

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const currency = stripeSettings.stripeCurrency;
  const appUrl = getAppUrl();

  // Settings で許可された payment_method_types のみ Stripe に渡す。
  // ハードコード `["card"]` fallback は禁止 — 空配列 / 全て invalid はドメインエラー。
  // claim より前で validate することで PENDING に遷移させたまま stuck を残さない。
  const paymentMethodTypes = stripeSettings.stripePaymentMethodTypes.filter(
    isStripePaymentMethodType,
  );
  if (paymentMethodTypes.length === 0) {
    throw new DomainError(
      "Stripe 決済方法が有効化されていません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const incompatibleMethods = findPaymentMethodsIncompatibleWithCurrency(
    paymentMethodTypes,
    currency,
  );
  if (incompatibleMethods.length > 0) {
    throw new DomainError(
      "選択された決済方法は現在の通貨設定と互換性がありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

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
        in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
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
    await prisma.reservation.updateMany({
      where: { id: reservationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError(
      "料金が設定されていない予約は決済できません",
      "VALIDATION",
    );
  }

  let createdSessionId: string | null = null;

  try {
    // Stripe session の `expires_at` を fail-safe cron の cutoff (PENDING_RESERVATION_EXPIRY_MINUTES)
    // と揃える (Codex P1: PR#1042 の silent orphan 予防)。
    // Stripe 側で session が expired になると `checkout.session.expired` webhook が
    // 発火し `claimReservationAsFailed` が PENDING → FAILED に遷移させる。cron 側は
    // `paymentInitiatedAt < cutoff` で拾って CANCELLED にする。両者が同時刻付近に
    // fire しても updateMany の WHERE claim が排他化するため副作用は 1 回限り。
    // Stripe API 制約: expires_at は 30 分 ~ 24 時間の範囲、Unix seconds。
    const expiresAt =
      Math.floor(claimedAt.getTime() / 1000) +
      PENDING_RESERVATION_EXPIRY_MINUTES * 60;

    const session = await client.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `予約: ${authoritative.space.name}`,
            },
            unit_amount: toStripeUnitAmount(
              authoritative.totalPriceWithTax,
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
      expires_at: expiresAt,
      success_url: `${appUrl}/mypage/reservations/${reservationId}?payment=success`,
      cancel_url: `${appUrl}/mypage/reservations/${reservationId}?payment=cancelled`,
    });
    createdSessionId = session.id;

    // session id を確定書込 + paymentStatus: PENDING を再 assert する。
    //
    // Codex Cloud Review P1 (PR#1017): claim (UNPAID→PENDING) から本 write の間に、
    // 古い/orphan の checkout.session.expired webhook が届くと `claimReservationAsFailed`
    // が PENDING → FAILED に flip し、その後の本 write が stripeCheckoutSessionId だけ
    // 書いて paymentStatus は FAILED のまま残す silent bug が発生する。結果:
    //   - コマンドは live session URL を返す
    //   - 顧客が Stripe で決済完了 → webhook checkout.session.completed 発火
    //   - `claimReservationAsPaid` は UNPAID/PENDING のみ受け付ける (FAILED は拒否)
    //   → 決済されたのに reservation が FAILED のまま滞留する会計 mismatch
    //
    // 修正: `updateMany` + WHERE `paymentStatus NOT IN [PAID, REFUNDED]` で
    // 「終端に達していなければ PENDING を再 assert」する。FAILED も PENDING に
    // 巻き戻して session URL 経由の決済を成立させる (session-specific webhook 分岐は
    // 別 issue で対応予定)。PAID/REFUNDED (異常に速い webhook / manual admin refund) は
    // 上書きしない — count === 0 になるが session URL は返す (webhook 側の冪等性に委任)。
    const settled = await prisma.reservation.updateMany({
      where: {
        id: reservationId,
        deletedAt: null,
        paymentStatus: {
          notIn: [
            PaymentStatus.PAID,
            PaymentStatus.PARTIALLY_REFUNDED,
            PaymentStatus.REFUNDED,
          ],
        },
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
      },
    });
    if (settled.count === 0) {
      // PAID / PARTIALLY_REFUNDED / REFUNDED が claim 後に確定 (異常に速い webhook /
      // manual admin refund)。orphan session を best-effort で expire し、session URL は
      // 返さない (二重決済・会計 mismatch を fail-closed で防ぐ)。
      logError(
        new Error(
          "createCheckoutSessionCommand: session settle rejected (already PAID/REFUNDED)",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "createCheckoutSession",
            reservationId,
            sessionId: session.id,
          },
        },
      );
      try {
        await client.checkout.sessions.expire(session.id);
      } catch (expireError) {
        logError(normalizeError(expireError), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "createCheckoutSessionExpire",
            reservationId,
            sessionId: session.id,
          },
        });
      }
      throw new DomainError("この予約は既に決済が完了しています", "CONFLICT");
    }

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: reservation.customerId,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    if (createdSessionId) {
      await expireOpenCheckoutSessionBestEffort({
        reservationId,
        sessionId: createdSessionId,
      });
    }
    // Stripe session 作成 or session id 書込が失敗した。UNPAID に revert して顧客が
    // 再試行できる状態に戻す。既に session が作られていても metadata.reservationId が
    // 分かるので webhook 側で orphan session を identify できる (最悪ケース: session だけ
    // 残るが webhook で reservation を PAID にできる。逆に reservation は UNPAID のまま
    // なので新たな checkout も可能で、その場合 webhook 側で二重確定を防ぐ既存契約に委ねる)。
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "createCheckoutSession", reservationId },
    });
    await prisma.reservation.updateMany({
      where: { id: reservationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
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

  let receiptWarning: string | undefined;
  try {
    const receipt = await issueReceiptForReservation(data.reservationId, {
      source: "manual-payment",
    });
    const detailUrl = buildReservationReceiptDetailUrl({
      reservationId: data.reservationId,
      userId: existing.userId,
    });
    fireAndForget(
      notifyReceiptIssuedForReservation({
        receiptId: receipt.id,
        detailUrl,
      }),
      {
        operation: "notifyReceiptIssuedForReservation",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          reservationId: data.reservationId,
          receiptId: receipt.id,
        },
      },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: data.reservationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING;
    } else {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: data.reservationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING;
    }
  }

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
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
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
 * - Stripe idempotency key = `reservation-refund-{reservationId}-{newCumulative}` で
 *   2 回目以降の部分返金でも unique になり、accidental retry (network glitch 等) は
 *   同一 amount + 同一 newCumulative で idempotent (safe)
 *
 * ## 並行制御
 * - interactive tx 冒頭で `pg_advisory_xact_lock(REFUND_LOCK_NAMESPACE, hashtext(reservationId))`
 *   を取得し、同一予約への concurrent refund を直列化する (over-refund 防止)
 * - Stripe API 呼び出しは tx 内で行う (advisory lock 保持中)。Prisma docs は「tx 内で
 *   長時間 network 操作を避けよ」とするが、tx を 2 分割すると advisory lock を跨いだ
 *   race で over-refund が発生するため、正確性を優先。timeout: 30_000ms で bounded。
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

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const result = await prisma.$transaction(
    async (tx) => {
      // 予約単位 advisory lock (concurrent refund 直列化 + over-refund 防止)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFUND_LOCK_NAMESPACE}::int4, hashtext(${reservationId}))`;

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          id: true,
          customerId: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          // Checkout は `totalPriceWithTax`（税込）を Stripe に送るため、実 charge
          // 額と refund 上限・領収書 (Receipt.amount) は `totalPriceWithTax` を
          // 単一 SSoT とする。
          totalPriceWithTax: true,
        },
      });

      if (!reservation) {
        throw new DomainError("予約が見つかりません", "NOT_FOUND");
      }

      // PAID + PARTIALLY_REFUNDED の両方から返金可能
      if (
        reservation.paymentStatus !== PaymentStatus.PAID &&
        reservation.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new DomainError(
          "支払い済み・一部返金済みの予約のみ返金できます",
          "VALIDATION",
        );
      }

      if (!reservation.stripePaymentIntentId) {
        throw new DomainError(
          "Stripe の決済情報が見つかりません",
          "VALIDATION",
        );
      }

      if (
        reservation.totalPriceWithTax === null ||
        reservation.totalPriceWithTax <= 0
      ) {
        throw new DomainError(
          "料金が設定されていない予約は返金できません",
          "VALIDATION",
        );
      }

      // 既 refund 累積額 (advisory lock 内で読むので TOCTOU なし)
      const aggregate = await tx.refund.aggregate({
        where: { reservationId },
        _sum: { amount: true },
      });
      const cumulativeSoFar = aggregate._sum.amount ?? 0;
      const remaining = reservation.totalPriceWithTax - cumulativeSoFar;

      if (remaining <= 0) {
        // paymentStatus が PARTIALLY_REFUNDED のまま累積が charge 額に
        // 到達している異常状態 (paymentStatus 側の flip が失敗)。次回 admin refund で顕在化する。
        throw new DomainError("この予約は既に全額返金済みです", "VALIDATION");
      }

      const amount = requestedAmount ?? remaining;

      if (!Number.isInteger(amount) || amount <= 0) {
        throw new DomainError(
          "返金額は 1 円以上の整数で指定してください",
          "VALIDATION",
        );
      }
      if (amount > remaining) {
        throw new DomainError(
          `返金額が残額を超えています (残額: ${remaining} 円)`,
          "VALIDATION",
        );
      }

      const newCumulative = cumulativeSoFar + amount;
      const willBeFullyRefunded =
        newCumulative === reservation.totalPriceWithTax;

      // Stripe refund (idempotent、tx 内で lock 保持しつつ実行)
      let refund;
      try {
        refund = await client.refunds.create(
          {
            payment_intent: reservation.stripePaymentIntentId,
            amount: toStripeUnitAmount(amount, stripeCurrency),
            // metadata.initiator: charge.refunded webhook が この refund を Stripe から
            // 受信したとき、正しい attribution (ADMIN / AUTO_ON_CANCEL) を復元するための
            // hint。無いと `applyChargeRefundIdempotent` の fallback で
            // "STRIPE_DASHBOARD" と mislabel される (webhook 先着 race)。
            metadata: {
              initiator: actorType,
              ...(reason ? { reason } : {}),
            },
          },
          {
            // 累積後の合計額を key に含めることで、同一 reservation の 2 回目以降の
            // 部分返金でも unique になる。accidental retry (同 cumulative + 同 amount)
            // は Stripe 側で既 result を返す (idempotent semantic 保持)。
            idempotencyKey: `reservation-refund-${reservationId}-${newCumulative}`,
          },
        );
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: { operation: "refundReservationPayment", reservationId },
        });
        throw new DomainError(
          "返金処理に失敗しました。しばらく経ってからお試しください。",
          "UNEXPECTED",
        );
      }

      // Belt-and-suspenders: webhook (charge.refunded) が先に同 stripeRefundId で
      // Refund を書いていた場合の idempotent 処理。
      //
      // Codex PR #1146 追加指摘 (P2): Prisma の `upsert({where, create, update: {}})` は
      // SELECT+INSERT に compile されるため並行 create で `refunds_stripeRefundId_key`
      // 一意制約違反が依然発生する (Prisma issue #20229)。単一 `create` + `catch (P2002)` が
      // 真 atomic pattern だが、interactive tx 内で query fail すると tx 全体が abort 状態
      // になる (PostgreSQL の semantics)。そのため PostgreSQL SAVEPOINT で局所 rollback を
      // 挟んで tx 全体を保護する。
      //
      // savepoint 名は tx 内で unique であれば良い (call site 単位で衝突しない)。
      try {
        await tx.$executeRaw`SAVEPOINT refund_create_reservation`;
        await tx.refund.create({
          data: {
            reservationId,
            amount,
            ...(reason ? { reason } : {}),
            stripeRefundId: refund.id,
            refundedByType: actorType,
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT refund_create_reservation`;
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error, "stripeRefundId"))
          throw error;
        // P2002 on stripeRefundId = webhook 経由が先着書込済 = idempotent success。
        // savepoint に rollback して tx 全体は継続 (paymentStatus 遷移等の後続 query は
        // 通常通り実行される)。書込主体・金額を保持する belt-and-suspenders 契約は不変。
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT refund_create_reservation`;
      }

      // paymentStatus 遷移 (updateMany で status guard)
      await tx.reservation.updateMany({
        where: {
          id: reservationId,
          deletedAt: null,
          paymentStatus: {
            in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
          },
        },
        data: {
          paymentStatus: willBeFullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      return {
        refundId: refund.id,
        status: refund.status,
        customerId: reservation.customerId,
        newPaymentStatus: willBeFullyRefunded
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
        cumulativeAmount: newCumulative,
        refundAmount: amount,
      } satisfies RefundReservationResult;
    },
    {
      // Stripe API timeout (30s default) + DB 書込を含めるため長め。
      timeout: 30_000,
      // concurrent refund tx で advisory lock が serialize する間、後発 tx が pool の
      // interactive slot 取得を待つ。Prisma default (2000ms) では test で pool 枯渇時に
      // 「Unable to start a transaction in the given time」で早期 timeout する。
      maxWait: 30_000,
    },
  );

  // AuditLog (tx 外、hash-chain の write は独立)
  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: "reservation",
    resourceId: reservationId,
    newValue: {
      paymentStatus: result.newPaymentStatus,
      refundedAmount: result.cumulativeAmount,
    },
    metadata: {
      actorType,
      refundAmount: result.refundAmount,
      cumulativeAmount: result.cumulativeAmount,
      stripeRefundId: result.refundId,
      ...(reason ? { reason } : {}),
      ...(request?.ip != null ? { ip: request.ip } : {}),
      ...(request?.userAgent != null ? { userAgent: request.userAgent } : {}),
    },
  });

  return result;
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

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFUND_LOCK_NAMESPACE}::int4, hashtext(${reservationId}))`;

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId, deletedAt: null },
        select: {
          status: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          totalPriceWithTax: true,
        },
      });

      if (!reservation) {
        return { outcome: "not_applicable" as const };
      }

      if (reservation.paymentStatus === PaymentStatus.REFUNDED) {
        return { outcome: "already_refunded" as const };
      }

      if (reservation.status !== ReservationStatus.CANCELLED) {
        return { outcome: "not_applicable" as const };
      }

      if (
        reservation.totalPriceWithTax === null ||
        reservation.totalPriceWithTax <= 0
      ) {
        return { outcome: "not_applicable" as const };
      }

      const paymentIntentId = stripePaymentIntentId;

      // 既 refund 累積額 (advisory lock 内で読むので TOCTOU なし)
      const aggregate = await tx.refund.aggregate({
        where: { reservationId },
        _sum: { amount: true },
      });
      const cumulativeSoFar = aggregate._sum.amount ?? 0;
      const remaining = reservation.totalPriceWithTax - cumulativeSoFar;

      if (remaining <= 0) {
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
        return { outcome: "already_refunded" as const };
      }

      let refund;
      try {
        refund = await client.refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: toStripeUnitAmount(remaining, stripeCurrency),
            metadata: {
              initiator: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
              reason,
            },
          },
          {
            idempotencyKey: `reservation-refund-${reservationId}-${reservation.totalPriceWithTax}`,
          },
        );
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.CRITICAL,
          context: {
            operation: "refundOrphanedStripePaymentForCancelledReservation",
            reservationId,
            stripePaymentIntentId: paymentIntentId,
          },
        });
        throw new DomainError(
          "キャンセル後の自動返金に失敗しました",
          "UNEXPECTED",
        );
      }

      try {
        await tx.$executeRaw`SAVEPOINT refund_create_auto_on_cancel`;
        await tx.refund.create({
          data: {
            reservationId,
            amount: remaining,
            reason,
            stripeRefundId: refund.id,
            refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT refund_create_auto_on_cancel`;
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error, "stripeRefundId")) {
          throw error;
        }
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT refund_create_auto_on_cancel`;
      }

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

      return {
        outcome: "refunded" as const,
        refundId: refund.id,
        refundAmount: remaining,
      };
    },
    { maxWait: 30_000, timeout: 30_000 },
  );

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: reservationId,
      metadata: {
        operation: "refundOrphanedStripePaymentForCancelledReservation",
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
