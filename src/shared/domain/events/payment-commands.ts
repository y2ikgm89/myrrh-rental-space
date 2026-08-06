import "server-only";

import {
  AuditAction,
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { readStandardTaxRateUncached } from "@/shared/domain/settings/queries/tax-rate-snapshot";
import { DomainError } from "@/shared/domain/domain-error";
import {
  assertOnlinePaymentAvailable,
  assertStripeCredentialsConfigured,
} from "@/shared/domain/payment/availability";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getStripeClient } from "@/shared/lib/stripe";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import {
  handleCheckoutSessionCreateFailure,
  rejectCheckoutSessionSettle,
  revertCheckoutPendingToUnpaid,
  settleCheckoutSessionWrite,
} from "@/shared/domain/payment/checkout-session-write-orchestration";
import { PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT } from "@/shared/domain/payment/payment-status-guards";
import {
  acquirePaymentRefundAdvisoryLock,
  createRefundRecordIdempotent,
  createStripeRefundOrThrow,
  isRefundSettledSuccess,
  PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS,
  PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS,
  REFUND_AGGREGATE_EXCLUDED_STATUSES,
  resolveRefundAmount,
} from "@/shared/domain/payment/stripe-refund-orchestration";
import { toStripeUnitAmount } from "@/shared/lib/stripe-shared";
import {
  findPaymentMethodsIncompatibleWithCurrency,
  isStripePaymentMethodType,
} from "@/shared/lib/stripe-payment-methods";
import { getAppUrl } from "@/shared/lib/constants";
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
import { issueReceiptForEventRegistration } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForEventRegistration } from "@/shared/domain/receipts/notify-issued";
import {
  createEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";
import {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} from "@/shared/domain/receipts/manual-payment-warnings";
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

  const stripeSettings = await assertOnlinePaymentAvailable();

  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const currency = stripeSettings.stripeCurrency;
  const appUrl = getAppUrl();

  // Settings で許可された payment_method_types のみ Stripe に渡す
  // (Reservation 側と同一 SSoT。ハードコード ["card"] fallback は禁止)。
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

  let createdSessionId: string | null = null;

  try {
    const expiresAt =
      Math.floor(claimedAt.getTime() / 1000) +
      UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES * 60;

    const session = await client.checkout.sessions.create(
      {
        mode: "payment",
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
          // webhook で「event-registration」経路を識別するための discriminator。
          // Reservation は metadata.reservationId のみで判定される既存契約なので
          // ここでは type + registrationId を明示して衝突を防ぐ。
          type: "event-registration",
          registrationId,
        },
        ...(authoritative.email ? { customer_email: authoritative.email } : {}),
        expires_at: expiresAt,
        // Codex P1 (PR#1026, comment 3567019753): 旧実装の `/events/registrations/{id}`
        // は存在しないルートで Stripe returnee が 404 していた。既存の公開イベント詳細
        // `/events/[slug]` にリダイレクトし、`registration` クエリで status バナー用に
        // 後続 PR がキーできるようにしておく。
        success_url: `${appUrl}/events/registrations/payment-result?payment=success&registration=${registrationId}&slug=${encodeURIComponent(authoritative.event.slug)}`,
        cancel_url: `${appUrl}/events/registrations/payment-result?payment=cancelled&registration=${registrationId}&slug=${encodeURIComponent(authoritative.event.slug)}`,
      },
      {
        idempotencyKey: `checkout/event-registration/${registrationId}/pending-claim`,
      },
    );
    createdSessionId = session.id;

    const { settled } = await settleCheckoutSessionWrite(
      (args) => prisma.eventRegistration.updateMany(args),
      {
        entityId: registrationId,
        sessionId: session.id,
        extraData: { paidAmount: authoritativeTotal },
      },
    );
    if (!settled) {
      await rejectCheckoutSessionSettle({
        client,
        sessionId: session.id,
        operation: "createEventCheckoutSessionCommand",
        logContext: { registrationId },
        conflictMessage: "この申込は既に決済が完了しています",
      });
    }

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: registration.customerId,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "createEventCheckoutSession",
        registrationId,
      },
    });
    await handleCheckoutSessionCreateFailure({
      createdSessionId,
      expireOpenCheckoutSessionBestEffort,
      revertPending: () =>
        revertCheckoutPendingToUnpaid(
          (args) => prisma.eventRegistration.updateMany(args),
          { entityId: registrationId },
        ),
      expireContext: { registrationId },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

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

  const stripeSettings = await assertOnlinePaymentAvailable();

  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const currency = stripeSettings.stripeCurrency;
  const appUrl = getAppUrl();

  const paymentMethodTypes = stripeSettings.stripePaymentMethodTypes.filter(
    isStripePaymentMethodType,
  );
  if (paymentMethodTypes.length === 0) {
    throw new DomainError(
      "Stripe 決済方法が有効化されていません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const waitlistIncompatibleMethods =
    findPaymentMethodsIncompatibleWithCurrency(paymentMethodTypes, currency);
  if (waitlistIncompatibleMethods.length > 0) {
    throw new DomainError(
      "選択された決済方法は現在の通貨設定と互換性がありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

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
  if (authoritative.expiresAt.getTime() <= now.getTime()) {
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
    (authoritative.expiresAt.getTime() - now.getTime()) / 1000,
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

  let createdSessionId: string | null = null;

  try {
    // Codex review Critical #1: Stripe Checkout Session の有効期限を offer 自身の
    // expiresAt（24h 期限）に揃える。Reservation 側 createCheckoutSessionCommand の
    // `expires_at` precedent（本ファイル兄弟 `src/shared/domain/reservations/
    // payment-commands.ts`、Codex P1: PR#1042 の silent orphan 予防）と同じ設計。
    const expiresAt = Math.floor(authoritative.expiresAt.getTime() / 1000);

    const session = await client.checkout.sessions.create(
      {
        mode: "payment",
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
          // webhook で「waitlist offer 経由の event-registration」経路を識別するための
          // discriminator。`source` の有無で `createEventCheckoutSessionCommand`
          // （直接購入、source なし）と区別する — 直接購入は登録時点で既に
          // status: CONFIRMED のため `confirmWaitlistOfferCommand` を呼んではいけない
          // （常に NOT_FOUND 例外になる）。webhook 側の分岐条件はこの契約に依存する。
          type: "event-registration",
          registrationId,
          source: "waitlist-offer",
        },
        ...(authoritative.email ? { customer_email: authoritative.email } : {}),
        expires_at: expiresAt,
        success_url: `${appUrl}/events/waitlist/confirm?token=${offerToken}`,
        cancel_url: `${appUrl}/events/${authoritative.event.slug}`,
      },
      {
        idempotencyKey: `checkout/waitlist-offer/${registrationId}/pending-claim`,
      },
    );
    createdSessionId = session.id;

    const { settled } = await settleCheckoutSessionWrite(
      (args) => prisma.eventRegistration.updateMany(args),
      {
        entityId: registrationId,
        sessionId: session.id,
        extraData: { paidAmount: authoritativeTotal },
      },
    );
    if (!settled) {
      await rejectCheckoutSessionSettle({
        client,
        sessionId: session.id,
        operation: "createWaitlistOfferCheckoutSessionCommand",
        logContext: { registrationId },
        conflictMessage: "この申込は既に決済が完了しています",
      });
    }

    if (!session.url) {
      // Stripe が payment mode session で url を返さないのは異常系（期限切れ/
      // 完了済み session の再読込でのみ null になる想定で、作成直後は非 null の
      // はず）。non-null assertion を使わず throw で catch ブロックの revert に
      // 合流させる。
      throw new Error("Stripe が checkout session の url を返しませんでした");
    }

    return { url: session.url, sessionId: session.id };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "createWaitlistOfferCheckoutSession",
        registrationId,
      },
    });
    await handleCheckoutSessionCreateFailure({
      createdSessionId,
      expireOpenCheckoutSessionBestEffort,
      revertPending: () =>
        revertCheckoutPendingToUnpaid(
          (args) => prisma.eventRegistration.updateMany(args),
          { entityId: registrationId },
        ),
      expireContext: { registrationId },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

/**
 * 管理者による手動入金記録。UNPAID → PAID の遷移を、Stripe を経由しない支払い
 * （現金・銀行振込等）について事後記録する。claimEventRegistrationAsPaid と同じ
 * updateMany WHERE claim パターンで二重確定を防ぐ。stripeCheckoutSessionId が
 * 非 null（Stripe決済が進行中/完了）の登録は対象外とする — walk-in/proxy 作成時は
 * この値が null 固定のため対象は自然に限定される。
 *
 * claim は `claimEventRegistrationAsPaid` と同様に `status: CONFIRMED` も要求する
 * (レビュー Important #1)。cancel 経路 (registration-cancel-core.ts) は paymentStatus
 * を触らず status のみ CANCELLED に遷移させるため、paymentStatus だけで claim すると
 * CANCELLED + UNPAID な登録を PAID に格上げできてしまい、かつ `isRefundable` は
 * stripePaymentIntentId 必須のため返金導線もない「CANCELLED+PAID で戻せない」
 * 会計不整合状態を作れてしまう。
 *
 * claim 成功後は `issueReceiptForEventRegistration` を await し、成功時のみ
 * `notifyReceiptIssuedForEventRegistration` を fire-and-forget する。領収書失敗でも
 * PAID は維持し、`receiptWarning` で部分失敗を返す（reservation 手動入金と同契約）。
 */
export type ManualEventPaymentResult = {
  registrationId: string;
  /**
   * PAID は確定したが領収書発行をスキップ / 延期したときの管理者向け警告。
   */
  receiptWarning?: string;
};

function buildEventRegistrationReceiptDetailUrl(input: {
  registrationId: string;
  customerId: string | null;
}): string {
  const appUrl = getAppUrl();
  // 会員: mypage 申込詳細。ゲスト: status token 付き薄い詳細ページ。
  if (input.customerId !== null) {
    return `${appUrl}/mypage/events/${input.registrationId}`;
  }
  const token = createEventRegistrationStatusToken(
    input.registrationId,
    new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/events/registrations/status?token=${token}`;
}

export async function recordManualEventPaymentCommand(data: {
  registrationId: string;
  amount: number;
}): Promise<ManualEventPaymentResult> {
  const existing = await prisma.eventRegistration.findUnique({
    where: { id: data.registrationId },
    select: {
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      customerId: true,
      quantity: true,
      ticket: { select: { price: true } },
    },
  });
  if (!existing) {
    throw new DomainError("参加登録が見つかりません", "NOT_FOUND");
  }
  if (existing.stripeCheckoutSessionId !== null) {
    throw new DomainError(
      "この参加登録はStripe決済が進行中または完了しているため、手動入金記録できません",
      "VALIDATION",
    );
  }

  const chargeBase = existing.ticket.price * existing.quantity;
  if (chargeBase <= 0) {
    throw new DomainError("無料チケットは手動入金記録できません", "VALIDATION");
  }
  if (data.amount !== chargeBase) {
    throw new DomainError(
      `入金額は${chargeBase}円と一致する必要があります`,
      "VALIDATION",
    );
  }

  // webhook 経路（`claimEventRegistrationAsPaid`）と同じく、決済確定の瞬間の
  // 標準税率を刻む。読めなければ null のまま（発行側が設定へ落ちる）。
  const taxRate = await readStandardTaxRateUncached();

  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: data.registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      paidAmount: data.amount,
      paidAt: new Date(),
      ...(taxRate !== null ? { taxRate } : {}),
    },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この参加登録はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "CONFLICT",
    );
  }

  let receiptWarning: string | undefined;
  try {
    const receipt = await issueReceiptForEventRegistration(
      data.registrationId,
      {
        source: "manual-payment",
      },
    );
    const detailUrl = buildEventRegistrationReceiptDetailUrl({
      registrationId: data.registrationId,
      customerId: existing.customerId,
    });
    fireAndForget(
      notifyReceiptIssuedForEventRegistration({
        receiptId: receipt.id,
        detailUrl,
      }),
      {
        operation: "notifyReceiptIssuedForEventRegistration",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          registrationId: data.registrationId,
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
          operation: "issueReceiptForEventRegistration",
          registrationId: data.registrationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING;
    } else {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "issueReceiptForEventRegistration",
          registrationId: data.registrationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING;
    }
  }

  return {
    registrationId: data.registrationId,
    ...(receiptWarning !== undefined ? { receiptWarning } : {}),
  };
}

// ---------------------------------------------------------------------------
// Refund (Reservation 側の refundReservationPaymentCommand の event 対称版、task #6)
// ---------------------------------------------------------------------------

export interface RefundEventRegistrationInput {
  registrationId: string;
  /**
   * 部分返金額 (円、正整数)。未指定なら残額全額 (paidAmount - Σrefunds.amount)。
   */
  amount?: number;
  /**
   * 管理者入力の理由。Refund.reason に保存し、AuditLog metadata にも流す。
   */
  reason?: string;
  /**
   * 「誰が」返金を主導したか。DB CHECK 制約と application 側 enum で二重防御。
   */
  actorType: RefundedByType;
  /**
   * AuditLog.userId に書く。ADMIN 経路は admin userId、AUTO_ON_CANCEL / STRIPE_DASHBOARD は
   * null (system / 外部起動)。
   */
  actorUserId?: string;
  /**
   * UA-HORIZ-04: リクエスト由来のフォレンジック context。admin action は
   * `buildAuditRequestContext()` から取得して渡す。webhook / system 起動経路は
   * `undefined` で呼び出し可 (metadata に ip/userAgent キーは付かない)。
   */
  request?: { ip: string | null; userAgent: string | null };
}

export interface RefundEventRegistrationResult {
  refundId: string;
  status: string | null;
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
 * EventRegistration の返金 (部分返金対応、Stripe idempotent、Refund child + AuditLog 書込)。
 *
 * ## 契約
 * - `paymentStatus` が `PAID` または `PARTIALLY_REFUNDED` の申込のみ返金可能
 * - `amount` 未指定 → 残額全額 (`paidAmount - Σ既 refunds.amount`)
 * - 累積返金額が `paidAmount` に到達したら `REFUNDED`、未満なら `PARTIALLY_REFUNDED`
 * - Stripe idempotency key = `event-registration-refund-{registrationId}-{newCumulative}` で
 *   2 回目以降の部分返金でも unique
 *
 * ## 並行制御
 * - Phase A/C: `pg_advisory_xact_lock` で同一申込の refund を直列化 (over-refund 防止)
 * - Phase B: Stripe API は tx 外。Phase C で累積額を再検証して persist
 * - Phase B 成功・Phase C 失敗時は webhook (`charge.refunded`) が救済
 *
 * @throws DomainError NOT_FOUND / VALIDATION / UNEXPECTED
 */
export async function refundEventRegistrationPaymentCommand(
  input: RefundEventRegistrationInput,
): Promise<RefundEventRegistrationResult> {
  const {
    registrationId,
    amount: requestedAmount,
    reason,
    actorType,
    actorUserId,
    request,
  } = input;

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const prepared = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const registration = await tx.eventRegistration.findFirst({
      where: { id: registrationId, event: { deletedAt: null } },
      select: {
        id: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
        paidAmount: true,
      },
    });

    if (!registration) {
      throw new DomainError("イベント申込が見つかりません", "NOT_FOUND");
    }

    if (
      registration.paymentStatus !== PaymentStatus.PAID &&
      registration.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new DomainError(
        "決済確定・一部返金済みのイベント申込のみ返金できます",
        "VALIDATION",
      );
    }

    if (!registration.stripePaymentIntentId) {
      throw new DomainError("Stripe の決済情報が見つかりません", "VALIDATION");
    }

    if (registration.paidAmount === null || registration.paidAmount <= 0) {
      throw new DomainError(
        "受領額が記録されていないイベント申込は返金できません",
        "VALIDATION",
      );
    }

    const aggregate = await tx.refund.aggregate({
      where: {
        eventRegistrationId: registrationId,
        status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;

    const resolved = resolveRefundAmount({
      chargeTotal: registration.paidAmount,
      cumulativeSoFar,
      ...(requestedAmount !== undefined ? { requestedAmount } : {}),
      fullyRefundedMessage: "このイベント申込は既に全額返金済みです",
    });

    return {
      amount: resolved.amount,
      cumulativeSoFar: resolved.cumulativeSoFar,
      newCumulative: resolved.newCumulative,
      willBeFullyRefunded: resolved.willBeFullyRefunded,
      paymentIntentId: registration.stripePaymentIntentId,
      idempotencyKey: `event-registration-refund-${registrationId}-${resolved.newCumulative}`,
    };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: prepared.paymentIntentId,
    amount: prepared.amount,
    stripeCurrency,
    metadata: {
      initiator: actorType,
      ...(reason ? { reason } : {}),
    },
    idempotencyKey: prepared.idempotencyKey,
    operation: "refundEventRegistrationPayment",
    logContext: { registrationId },
    userMessage: "返金処理に失敗しました。しばらく経ってからお試しください。",
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const aggregate = await tx.refund.aggregate({
      where: {
        eventRegistrationId: registrationId,
        status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;
    if (cumulativeSoFar !== prepared.cumulativeSoFar) {
      throw new DomainError(
        "返金処理中に状態が変更されました。管理者に連絡してください。",
        "CONFLICT",
      );
    }

    const isSettled = isRefundSettledSuccess(refund.status);

    await createRefundRecordIdempotent(tx, "refund_create_event", {
      eventRegistrationId: registrationId,
      amount: prepared.amount,
      ...(reason ? { reason } : {}),
      stripeRefundId: refund.id,
      refundedByType: actorType,
      status: refund.status ?? "pending",
    });

    // konbini / customer_balance 等の非同期返金が未確定の間は paymentStatus を
    // 書き換えない。確定は refund.updated webhook が行う。
    if (isSettled) {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          paymentStatus: {
            in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
          },
        },
        data: {
          paymentStatus: prepared.willBeFullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
    }

    return {
      refundId: refund.id,
      status: refund.status,
      newPaymentStatus: prepared.willBeFullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED,
      isSettled,
      cumulativeAmount: prepared.newCumulative,
      refundAmount: prepared.amount,
    } satisfies RefundEventRegistrationResult;
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  // AuditLog (tx 外)。isSettled=false (konbini 等の非同期返金が未確定) の間は
  // paymentStatus を実際には書き換えていないため、append-only の証跡に到達目標の
  // 状態を確定事実として記録しない (Codex review, PR #1665)。
  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: "event-registration",
    resourceId: registrationId,
    newValue: result.isSettled
      ? {
          paymentStatus: result.newPaymentStatus,
          refundedAmount: result.cumulativeAmount,
        }
      : { refundStatus: result.status },
    metadata: {
      actorType,
      refundAmount: result.refundAmount,
      cumulativeAmount: result.cumulativeAmount,
      stripeRefundId: result.refundId,
      isSettled: result.isSettled,
      ...(reason ? { reason } : {}),
      ...(request?.ip != null ? { ip: request.ip } : {}),
      ...(request?.userAgent != null ? { userAgent: request.userAgent } : {}),
    },
  });

  return result;
}

/**
 * キャンセル済み EventRegistration への Stripe 決済成立 orphan を
 * PENDING/UNPAID → REFUNDED に閉じる。
 *
 * `refundEventRegistrationPaymentCommand` は PAID 前提のため使えない。
 * Reservation 側 `refundOrphanedStripePaymentForCancelledReservation` と同型。
 */
export async function refundOrphanedStripePaymentForCancelledEventRegistration(input: {
  registrationId: string;
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
    registrationId,
    stripePaymentIntentId,
    reason = "キャンセル済みイベント申込への決済成立に伴う自動返金",
  } = input;

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const prepareResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const registration = await tx.eventRegistration.findFirst({
      where: { id: registrationId, event: { deletedAt: null } },
      select: {
        status: true,
        paymentStatus: true,
        paidAmount: true,
        quantity: true,
        ticket: { select: { price: true } },
      },
    });

    if (!registration) {
      return { outcome: "not_applicable" as const };
    }

    if (registration.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (registration.status !== RegistrationStatus.CANCELLED) {
      return { outcome: "not_applicable" as const };
    }

    const expectedAmount =
      registration.paidAmount != null && registration.paidAmount > 0
        ? registration.paidAmount
        : registration.ticket.price * registration.quantity;

    if (expectedAmount <= 0) {
      return { outcome: "not_applicable" as const };
    }

    const paymentIntentId = stripePaymentIntentId;

    const aggregate = await tx.refund.aggregate({
      where: {
        eventRegistrationId: registrationId,
        status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;
    const remaining = expectedAmount - cumulativeSoFar;

    if (remaining <= 0) {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          status: RegistrationStatus.CANCELLED,
          paymentStatus: { not: PaymentStatus.REFUNDED },
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId: paymentIntentId,
        },
      });
      return { outcome: "already_refunded" as const };
    }

    return {
      outcome: "stripe_refund" as const,
      amount: remaining,
      cumulativeSoFar,
      paymentIntentId,
      idempotencyKey: `event-registration-cancel-orphan-refund-${registrationId}-${expectedAmount}`,
    };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  if (prepareResult.outcome !== "stripe_refund") {
    return prepareResult;
  }

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: prepareResult.paymentIntentId,
    amount: prepareResult.amount,
    stripeCurrency,
    metadata: {
      initiator: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      reason,
    },
    idempotencyKey: prepareResult.idempotencyKey,
    operation: "refundOrphanedStripePaymentForCancelledEventRegistration",
    logContext: {
      registrationId,
      stripePaymentIntentId: prepareResult.paymentIntentId,
    },
    userMessage: "キャンセル後の自動返金に失敗しました",
    severity: ErrorSeverity.CRITICAL,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const aggregate = await tx.refund.aggregate({
      where: {
        eventRegistrationId: registrationId,
        status: { notIn: [...REFUND_AGGREGATE_EXCLUDED_STATUSES] },
      },
      _sum: { amount: true },
    });
    const cumulativeSoFar = aggregate._sum.amount ?? 0;
    if (cumulativeSoFar !== prepareResult.cumulativeSoFar) {
      throw new DomainError(
        "返金処理中に状態が変更されました。管理者に連絡してください。",
        "CONFLICT",
      );
    }

    await createRefundRecordIdempotent(
      tx,
      "refund_create_event_auto_on_cancel",
      {
        eventRegistrationId: registrationId,
        amount: prepareResult.amount,
        reason,
        stripeRefundId: refund.id,
        refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        status: refund.status ?? "pending",
      },
    );

    // konbini / customer_balance 等の非同期返金が未確定の間は paymentStatus を
    // 書き換えない。確定は refund.updated webhook が行う。
    if (!isRefundSettledSuccess(refund.status)) {
      return {
        outcome: "refunded" as const,
        refundId: refund.id,
        refundAmount: prepareResult.amount,
      };
    }

    await tx.eventRegistration.updateMany({
      where: {
        id: registrationId,
        status: RegistrationStatus.CANCELLED,
        paymentStatus: { not: PaymentStatus.REFUNDED },
      },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        stripePaymentIntentId: prepareResult.paymentIntentId,
        paidAt: new Date(),
      },
    });

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: prepareResult.amount,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: registrationId,
      metadata: {
        operation: "refundOrphanedStripePaymentForCancelledEventRegistration",
        actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}

/**
 * Waitlist offer: Stripe 課金成功後に confirm が EXPIRED（容量/期限 race）になった
 * orphan を PENDING → REFUNDED に閉じる。
 *
 * `refundEventRegistrationPaymentCommand` は PAID 前提のため使えない。
 * paymentIntent は webhook session 由来（DB 未保存でも可）。
 */
export async function refundExpiredWaitlistOfferPaymentCommand(input: {
  registrationId: string;
  stripePaymentIntentId: string;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    registrationId,
    stripePaymentIntentId,
    reason = "Waitlist capacity race after successful payment",
  } = input;

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const prepareResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const registration = await tx.eventRegistration.findFirst({
      where: { id: registrationId, event: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paidAmount: true,
        stripePaymentIntentId: true,
      },
    });

    if (!registration) {
      return { outcome: "not_applicable" as const };
    }

    if (registration.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (
      registration.status !== RegistrationStatus.EXPIRED ||
      registration.paymentStatus !== PaymentStatus.PENDING ||
      registration.paidAmount === null ||
      registration.paidAmount <= 0
    ) {
      return { outcome: "not_applicable" as const };
    }

    return {
      outcome: "stripe_refund" as const,
      amount: registration.paidAmount,
      idempotencyKey: `event-registration-capacity-race-refund-${registrationId}`,
    };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  if (prepareResult.outcome !== "stripe_refund") {
    return prepareResult;
  }

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: stripePaymentIntentId,
    amount: prepareResult.amount,
    stripeCurrency,
    metadata: {
      initiator: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
      reason,
    },
    idempotencyKey: prepareResult.idempotencyKey,
    operation: "refundExpiredWaitlistOfferPayment",
    logContext: { registrationId },
    userMessage: "容量レース後の自動返金に失敗しました",
    severity: ErrorSeverity.CRITICAL,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    await createRefundRecordIdempotent(tx, "refund_create_capacity_race", {
      eventRegistrationId: registrationId,
      amount: prepareResult.amount,
      reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
      status: refund.status ?? "pending",
    });

    // konbini / customer_balance 等の非同期返金が未確定の間は paymentStatus を
    // 書き換えない。確定は refund.updated webhook が行う。
    if (isRefundSettledSuccess(refund.status)) {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          status: RegistrationStatus.EXPIRED,
          paymentStatus: PaymentStatus.PENDING,
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          stripePaymentIntentId,
        },
      });
    }

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: prepareResult.amount,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: registrationId,
      metadata: {
        operation: "refundExpiredWaitlistOfferPayment",
        actorType: REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}

/**
 * Checkout Session の amount_total が DB 期待額と不一致のため fulfill できなかった
 * captured payment を自動返金し `paymentStatus=REFUNDED` に収束させる（idempotent）。
 */
export async function refundCheckoutAmountMismatchForEventRegistration(input: {
  registrationId: string;
  stripePaymentIntentId: string;
  capturedAppAmount: number;
  reason?: string;
}): Promise<{
  outcome: "refunded" | "already_refunded" | "not_applicable";
  refundId?: string;
  refundAmount?: number;
}> {
  const {
    registrationId,
    stripePaymentIntentId,
    capturedAppAmount,
    reason = "Checkout 金額不一致のための自動返金",
  } = input;

  if (capturedAppAmount <= 0) {
    return { outcome: "not_applicable" };
  }

  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const stripeCurrency = stripeSettings.stripeCurrency;

  const prepareResult = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    const registration = await tx.eventRegistration.findFirst({
      where: { id: registrationId, event: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
      },
    });

    if (!registration) {
      return { outcome: "not_applicable" as const };
    }

    if (registration.paymentStatus === PaymentStatus.REFUNDED) {
      return { outcome: "already_refunded" as const };
    }

    if (
      registration.status !== RegistrationStatus.CONFIRMED &&
      registration.status !== RegistrationStatus.WAITLISTED_OFFERED &&
      registration.status !== RegistrationStatus.EXPIRED
    ) {
      return { outcome: "not_applicable" as const };
    }

    if (
      registration.paymentStatus !== PaymentStatus.UNPAID &&
      registration.paymentStatus !== PaymentStatus.PENDING
    ) {
      return { outcome: "not_applicable" as const };
    }

    return {
      outcome: "stripe_refund" as const,
      idempotencyKey: `event-registration-amount-mismatch-refund-${registrationId}`,
    };
  }, PAYMENT_REFUND_PREPARE_TRANSACTION_OPTIONS);

  if (prepareResult.outcome !== "stripe_refund") {
    return prepareResult;
  }

  const refund = await createStripeRefundOrThrow({
    client,
    paymentIntentId: stripePaymentIntentId,
    amount: capturedAppAmount,
    stripeCurrency,
    metadata: {
      initiator: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
      reason,
    },
    idempotencyKey: prepareResult.idempotencyKey,
    operation: "refundCheckoutAmountMismatchForEventRegistration",
    logContext: { registrationId },
    userMessage: "金額不一致の自動返金に失敗しました",
    severity: ErrorSeverity.CRITICAL,
  });

  const result = await prisma.$transaction(async (tx) => {
    await acquirePaymentRefundAdvisoryLock(
      tx,
      "event-registration",
      registrationId,
    );

    await createRefundRecordIdempotent(tx, "refund_create_amount_mismatch", {
      eventRegistrationId: registrationId,
      amount: capturedAppAmount,
      reason,
      stripeRefundId: refund.id,
      refundedByType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
      status: refund.status ?? "pending",
    });

    // konbini / customer_balance 等の非同期返金が未確定の間は paymentStatus を
    // 書き換えない。確定は refund.updated webhook が行う。
    if (isRefundSettledSuccess(refund.status)) {
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          status: {
            in: [
              RegistrationStatus.CONFIRMED,
              RegistrationStatus.WAITLISTED_OFFERED,
              RegistrationStatus.EXPIRED,
            ],
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
    }

    return {
      outcome: "refunded" as const,
      refundId: refund.id,
      refundAmount: capturedAppAmount,
    };
  }, PAYMENT_REFUND_PERSIST_TRANSACTION_OPTIONS);

  if (result.outcome === "refunded") {
    await createAuditLogRecord({
      action: AuditAction.UPDATE,
      resource: "event-registration",
      resourceId: registrationId,
      metadata: {
        operation: "refundCheckoutAmountMismatchForEventRegistration",
        actorType: REFUNDED_BY_TYPE.AUTO_AMOUNT_MISMATCH,
        reason,
        refundId: result.refundId,
        refundAmount: result.refundAmount,
      },
    });
  }

  return result;
}
