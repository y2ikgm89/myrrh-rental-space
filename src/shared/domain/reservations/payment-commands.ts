import "server-only";

import { PaymentStatus, ReservationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { getStripeClient } from "@/shared/lib/stripe";
import { getAppUrl } from "@/shared/lib/constants";
import { isStripePaymentMethodType } from "@/shared/lib/stripe-payment-methods";
import { PENDING_RESERVATION_EXPIRY_MINUTES } from "@/shared/domain/reservations/pending-expiry";
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
            unit_amount: toStripeUnitAmount(authoritative.totalPrice, currency),
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
          notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
        },
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
      },
    });
    if (settled.count === 0) {
      // PAID / REFUNDED が既に確定していた (異常に速い webhook / manual admin refund)。
      // stripeCheckoutSessionId は書けないが session URL は既に有効なので顧客は決済でき、
      // webhook 側の冪等 claim (UNPAID/PENDING のみ accept) がスキップしてくれる。
      logError(
        new Error(
          "createCheckoutSessionCommand: session settled skipped (already PAID/REFUNDED)",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "createCheckoutSession", reservationId },
        },
      );
    }

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

  const stripeSettings = await assertOnlinePaymentAvailable();

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
