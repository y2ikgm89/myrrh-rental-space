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

/**
 * Waitlist 繰り上げ当選（有料チケット）の Stripe Checkout Session を作成する (Task 9)。
 *
 * `createEventCheckoutSessionCommand` と同じ claim-first 設計だが、claim 対象が異なる:
 * - status は CONFIRMED ではなく WAITLISTED_OFFERED を要求する（繰り上げ当選はまだ
 *   確定していない。確定は webhook 到達時の `confirmWaitlistOfferCommand` が容量
 *   再チェック付きで行う — `checkout.session.completed` ハンドラ参照）
 * - paymentStatus の claim gate は UNPAID だけでなく FAILED も許容する（Reservation の
 *   `createCheckoutSessionCommand` と同じ「再決済許容」パターン）。offer には 24h の
 *   確定期限があり、途中で決済に失敗しても期限内は再挑戦できる必要があるため、
 *   `createEventCheckoutSessionCommand`（UNPAID / FAILED 許容）と同型の再決済許容パターン。
 *   offer には 24h の確定期限があり、途中で決済に失敗しても期限内は再挑戦できる必要があるため、
 *   両 command で claim gate を揃えている — Task 9 report の deviation 参照
 *
 * token 自体が一次認可のため actorCustomerId チェックは行わない
 * （`confirmWaitlistOfferAction` / `checkout/[token]/route.ts` と同方針）。
 *
 * Stripe Checkout Session の `expires_at` を offer 自身の `expiresAt`（24h 期限）に
 * 揃える（Fix commit, レビュー Critical #1 対応）。揃えないと cron
 * `waitlist-expire` が offer を先に EXPIRED 化した後でも Stripe session だけ
 * 生き残り、silent orphan（money captured だが確認不能）になる。詳細は下記
 * try ブロック内コメント参照。
 */
export async function createWaitlistOfferCheckoutSessionCommand(input: {
  registrationId: string;
  offerToken: string;
}): Promise<{ url: string; sessionId: string }> {
  const { registrationId, offerToken } = input;

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, status: true },
  });

  if (!registration) {
    throw new DomainError(
      "対象の繰り上げ当選申込が見つかりません",
      "NOT_FOUND",
    );
  }

  if (registration.status !== RegistrationStatus.WAITLISTED_OFFERED) {
    throw new DomainError(
      "この繰り上げ当選は確定待ちの状態ではありません",
      "VALIDATION",
    );
  }

  const stripeContext = await resolveCheckoutStripeContext();
  const { currency, paymentMethodTypes, appUrl } = stripeContext;

  // Claim-first: WAITLISTED_OFFERED はそのまま、paymentStatus のみ atomic に
  // UNPAID/FAILED → PENDING へ遷移させる（24h offer window 内の再決済を許容）。
  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.WAITLISTED_OFFERED,
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

  // Claim 成功後の authoritative な再読み込み（直前の edit を反映）。
  const authoritative = await prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: RegistrationStatus.WAITLISTED_OFFERED,
    },
    select: {
      email: true,
      quantity: true,
      expiresAt: true,
      ticket: { select: { name: true, price: true } },
      event: { select: { title: true, slug: true } },
    },
  });

  if (!authoritative || authoritative.ticket.price <= 0) {
    // 「claim 済みだが金額が消えた」異常状態。UNPAID に revert して stuck state を解消。
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.eventRegistration.updateMany(args),
      { entityId: registrationId },
    );
    throw new DomainError("チケット料金が設定されていません", "VALIDATION");
  }

  if (!authoritative.expiresAt) {
    // WAITLISTED_OFFERED は offerNextWaitlistEntryCommand が status 遷移と同時に
    // 必ず expiresAt を設定するため理論上到達しないが、列は nullable なので
    // 型レベルで防御する（non-null assertion は使わない）。「claim 済みだが
    // 期限情報が消えた」異常状態として、上と同じく UNPAID に revert する。
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.eventRegistration.updateMany(args),
      { entityId: registrationId },
    );
    throw new DomainError("確定期限の情報が取得できませんでした", "VALIDATION");
  }

  const offerExpiresAt = authoritative.expiresAt;

  // Codex P1-A: claim（UNPAID/FAILED → PENDING）は status: WAITLISTED_OFFERED
  // のみを見ており、offer 自体が既に期限切れ（expiresAt <= now）かどうかを見て
  // いない。hourly cron（waitlist-expire）がまだ EXPIRED 化していないケースで
  // 期限切れ後でも checkout を開始できてしまう。決済完了後に webhook が呼ぶ
  // `confirmWaitlistOfferCommand` は現在時刻で改めて expiresAt を判定するため
  // EXPIRED 遷移になり、支払い済みなのに確定できない money-handling 事故になる
  // （PR#1080 Codex P1-A レビュー）。ここで claim 直後に再検証し、既に期限切れ
  // なら PENDING を UNPAID に revert して（cron の通常 EXPIRED 化に委ねる）
  // Stripe セッションを作らない。エラーメッセージは checkout route.ts の
  // `isGenuineOfferExpiry` allowlist と密結合（変更時は両方更新する）。
  const now = new Date();
  if (offerExpiresAt.getTime() <= now.getTime()) {
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.eventRegistration.updateMany(args),
      { entityId: registrationId },
    );
    throw new DomainError("この繰り上げ当選は既に期限切れです", "VALIDATION");
  }

  // Stripe Checkout Session の expires_at は作成時刻から最短 30 分。offer 残りが
  // それ未満の場合にフロアで延命すると、offer 期限後の決済 → capacity/expiry
  // race（自動返金必須経路）に流入する。クリーンに拒否して次候補へ委ねる。
  const remainingSeconds = Math.floor(
    (offerExpiresAt.getTime() - now.getTime()) / 1000,
  );
  if (remainingSeconds < 30 * 60) {
    await revertCheckoutPendingToUnpaid(
      (args) => prisma.eventRegistration.updateMany(args),
      { entityId: registrationId },
    );
    throw new DomainError(
      "確定期限までの残り時間が短いため、決済を開始できません。期限切れ後に次の待機者へ繰り上がります。",
      "VALIDATION",
    );
  }

  const authoritativeTotal =
    authoritative.ticket.price * authoritative.quantity;

  return orchestrateCheckoutSessionCreate({
    operation: "createWaitlistOfferCheckoutSessionCommand",
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
        source: "waitlist-offer",
      },
      ...(authoritative.email ? { customer_email: authoritative.email } : {}),
      expires_at: Math.floor(offerExpiresAt.getTime() / 1000),
      success_url: `${appUrl}/events/waitlist/confirm?token=${offerToken}`,
      cancel_url: `${appUrl}/events/${authoritative.event.slug}`,
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
      url: session.url,
      sessionId: session.id,
    }),
  });
}
