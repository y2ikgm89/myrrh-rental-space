import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getStripeClient } from "@/shared/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JPY など小数点なし通貨（unit_amount がそのまま最小単位） */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "jpy",
  "krw",
  "vnd",
  "bif",
  "clp",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * 通貨に応じた Stripe unit_amount を計算
 * JPY 等のゼロ小数点通貨はそのまま、それ以外は 100 倍
 */
function toStripeUnitAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amount
    : Math.round(amount * 100);
}

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

  if (reservation.paymentStatus !== PaymentStatus.UNPAID) {
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

  const stripeSettings = await getStripeSettings();
  if (!stripeSettings?.stripeEnabled) {
    throw new DomainError("Stripe 決済が有効になっていません", "VALIDATION");
  }

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const currency = stripeSettings.stripeCurrency ?? "jpy";
  const appUrl = getAppUrl();

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
  const claimed = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      deletedAt: null,
      paymentStatus: PaymentStatus.UNPAID,
    },
    data: { paymentStatus: PaymentStatus.PENDING },
  });
  if (claimed.count === 0) {
    // 別 request (別 checkout / 手動 admin refund 経路) が先に PENDING に遷移させた。
    throw new DomainError(
      "この予約は別のリクエストで既に決済処理が開始されています",
      "CONFLICT",
    );
  }

  // Claim 成功後の authoritative な reservation を再読み込みする。
  // - totalPrice: claim 直前の edit を反映した最新値を Stripe に渡す
  // - customer/space/email: edit で顧客差替や guestEmail 変更があった場合も追随
  const authoritative = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      totalPrice: true,
      guestEmail: true,
      space: { select: { name: true } },
      customer: { select: { email: true } },
    },
  });

  if (
    !authoritative ||
    authoritative.totalPrice === null ||
    authoritative.totalPrice <= 0
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

  try {
    const session = await client.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `予約: ${authoritative.space.name}`,
            },
            unit_amount: toStripeUnitAmount(authoritative.totalPrice, currency),
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservationId,
      },
      customer_email: authoritative.guestEmail ?? authoritative.customer.email,
      success_url: `${appUrl}/mypage/reservations/${reservationId}?payment=success`,
      cancel_url: `${appUrl}/mypage/reservations/${reservationId}?payment=cancelled`,
    });

    // session id を確定書込。既に PENDING は claim 済みなので stripeCheckoutSessionId
    // のみ更新する。stripeCheckoutSessionId は @unique なので session.id を保存できるのは
    // 1 回のみ (二重 claim があった場合は Prisma エラーになるが、そもそも claim で防ぐ)。
    await prisma.reservation.update({
      where: { id: reservationId, deletedAt: null },
      data: { stripeCheckoutSessionId: session.id },
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: reservation.customerId,
    };
  } catch (error) {
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

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export async function refundReservationPaymentCommand(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      totalPrice: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (reservation.paymentStatus !== PaymentStatus.PAID) {
    throw new DomainError("支払い済みの予約のみ返金できます", "VALIDATION");
  }

  if (!reservation.stripePaymentIntentId) {
    throw new DomainError("Stripe の決済情報が見つかりません", "VALIDATION");
  }

  const stripeSettings = await getStripeSettings();
  if (!stripeSettings?.stripeEnabled) {
    throw new DomainError("Stripe 決済が有効になっていません", "VALIDATION");
  }

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  try {
    const refund = await client.refunds.create(
      {
        payment_intent: reservation.stripePaymentIntentId,
      },
      {
        idempotencyKey: `reservation-refund-${reservation.id}`,
      },
    );

    await prisma.reservation.updateMany({
      where: {
        id: reservationId,
        deletedAt: null,
        paymentStatus: PaymentStatus.PAID,
      },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
      },
    });

    return {
      refundId: refund.id,
      status: refund.status,
      customerId: reservation.customerId,
    };
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "refundReservationPayment", reservationId },
    });
    throw new DomainError(
      "返金処理に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}
