/**
 * Stripe Webhook API
 *
 * Stripe からの Webhook イベントを受信し、
 * 予約 / イベント申込（直接購入・waitlist 繰り上げ当選）の決済ステータスを更新します。
 *
 * ## 処理イベント（Stripe 公式推奨の Checkout フルセット）
 * - checkout.session.completed: セッション完了（即時決済 → PAID / 非同期決済 → PENDING 維持）
 * - checkout.session.async_payment_succeeded: 非同期決済（konbini / bank transfer 等）
 *   成功 → PAID（reservation / event-registration の直接購入・waitlist offer
 *   全経路対応 — Fix commit, レビュー Important #2 で event-registration を追加配線。
 *   waitlist offer は checkout.session.completed と同じく
 *   `confirmWaitlistOfferCommand` の容量再チェックを PAID 確定より先に通す）
 * - checkout.session.async_payment_failed: 非同期決済失敗 → FAILED
 * - checkout.session.expired: セッション期限切れ → FAILED
 * - charge.refunded: 返金完了 → REFUNDED（reservation のみ。event-registration の
 *   自動返金導線は未実装 — 容量race時は CRITICAL ログで手動対応）
 *
 * ## 決済対象の判別（`extractPaymentSubject`）
 * `session.metadata` の shape で reservation / event-registration を判別する
 * （reservation は `metadata.reservationId` のみ、event-registration は
 * `metadata.type === "event-registration"` + `metadata.registrationId`）。
 * event-registration はさらに `metadata.source === "waitlist-offer"` で
 * 「waitlist 繰り上げ当選経由」か「直接購入
 * （`createEventCheckoutSessionCommand`）」かを区別する。前者のみ
 * `confirmWaitlistOfferCommand`（容量再チェック）を PAID 確定より先に呼ぶ
 * （直接購入は登録時点で既に status: CONFIRMED のため対象外）。
 *
 * ## べき等性（atomic claim）
 * 各 handler は `claimReservationAs*` / `claimEventRegistrationAs*` の
 * **WHERE 条件で status/paymentStatus を排他制御**する単一 UPDATE で状態遷移する。
 * `findUnique → update` の 2 ステップでは race window が残り、`session.completed` と
 * `async_payment_succeeded` の並行配信で確認メールが二重送信される silent bug を
 * 起こすため、claim 成否（`updateMany.count > 0`）で後続副作用（メール送信 /
 * cache invalidate）を gate する。
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 * @module api/webhooks/stripe
 */

import type Stripe from "stripe";
import { unstable_rethrow } from "next/navigation";
import {
  claimReservationAsPaid,
  claimReservationAsFailed,
  applyChargeRefundIdempotent,
  savePaymentIntentId,
  findReservationByPaymentIntent,
} from "@/shared/domain/reservations/payment-queries";
import { DomainError } from "@/shared/domain/domain-error";
import { confirmWaitlistOfferCommand } from "@/shared/domain/events/waitlist-commands";
import {
  claimEventRegistrationAsPaid,
  claimEventRegistrationAsFailed,
  saveEventRegistrationPaymentIntentId,
  findEventRegistrationByPaymentIntent,
  applyEventChargeRefundIdempotent,
} from "@/shared/domain/events/payment-commands";
import { getWaitlistConfirmationEmailDetails } from "@/shared/domain/events/waitlist-queries";
import { sendEventRegistrationConfirmation } from "@/shared/lib/email/event-emails";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import {
  issueReceiptForReservation,
  issueReceiptForEventRegistration,
} from "@/shared/domain/receipts/issue";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { getStripeClient } from "@/shared/lib/stripe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// POST /api/webhooks/stripe
// =============================================================================

export async function POST(request: Request) {
  try {
    // 1. 署名ヘッダーの早期チェック（DB アクセス前に偽造リクエストを弾く）
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonError("Missing stripe-signature header", 400);
    }

    // 2. オンライン決済 gate (feature module + credentials) をドメイン層で検証。
    //    feature OFF / credentials 欠損はどちらも 503 で Stripe に「一時的に受けられない」と
    //    伝える（Stripe は 503 を exponential backoff で 3 日間再送するため、admin が
    //    設定を復旧すれば配送に成功する）。
    let settings;
    try {
      settings = await assertOnlinePaymentAvailable();
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 3. Webhook シークレットを復号
    const webhookSecret = safeDecryptToString(settings.stripeWebhookSecret, {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
    });
    if (!webhookSecret) {
      logError(new Error("Failed to decrypt Stripe webhook secret"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 4. Stripe クライアント取得 + 署名検証
    const { client } = await getStripeClient(settings.stripeSecretKey);
    if (!client) {
      logError(new Error("Stripe client not available"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    let event: Stripe.Event;
    try {
      // Bun runtime は WebCrypto のみで SubtleCryptoProvider (async-only) を選択するため、
      // sync 版 constructEvent は "SubtleCryptoProvider cannot be used in a synchronous context"
      // で throw する。Stripe SDK 公式の async 版を使用する。
      // 公式: https://github.com/stripe/stripe-node — "Use `await constructEventAsync(...)`"
      event = await client.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch (verifyError) {
      logError(normalizeError(verifyError), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "stripeWebhookSignatureVerification" },
      });
      return jsonError("Invalid signature", 400);
    }

    // 5. イベント処理（Stripe 公式推奨の Checkout フルセット）
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case "checkout.session.async_payment_succeeded":
        await handleAsyncPaymentSucceeded(event.data.object);
        break;

      case "checkout.session.async_payment_failed":
        await handleAsyncPaymentFailed(event.data.object);
        break;

      case "checkout.session.expired":
        await handleCheckoutSessionExpired(event.data.object);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;

      default:
        // 未対応イベントは無視（200 を返す）
        break;
    }

    return jsonSuccess({ received: true });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "stripeWebhook" },
    });
    // 内部例外は 500 を返して Stripe に再送させる。
    // - 冪等性は各 handler の `claimReservationAs*` atomic claim で担保済
    //   （重複 PAID/REFUNDED/FAILED は updateMany.count === 0 で副作用 skip）
    // - 200 で握り潰すと一過性の DB 障害等で予約が PAID に遷移できず silent stuck
    // - エラー詳細は body に出さず log のみ（情報漏洩防止）
    // @see https://docs.stripe.com/webhooks (5xx → exponential backoff retry up to 3 days)
    return jsonError("Webhook processing failed", 500);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checkout Session から決済対象（予約 or イベント申込）を判別する。
 *
 * - reservation は `metadata.reservationId` のみで判定される既存契約
 *   （`createCheckoutSessionCommand` 参照、`type` フィールドは付与されない）
 * - event-registration は `metadata.type === "event-registration"` +
 *   `metadata.registrationId` で判定する（`createEventCheckoutSessionCommand` /
 *   `createWaitlistOfferCheckoutSessionCommand` 参照）
 *
 * どちらにも合致しない場合は **throw せず null を返す**。未知/欠損 metadata で
 * 500 を返すと Stripe が exponential backoff で再送し続ける無限リトライになる
 * ため、呼び出し側は log のみで skip し 200 を返す。
 */
type PaymentSubject =
  | { kind: "reservation"; reservationId: string }
  | { kind: "event-registration"; registrationId: string };

function extractPaymentSubject(
  session: Stripe.Checkout.Session,
  operation: string,
): PaymentSubject | null {
  const metadata = session.metadata;

  if (metadata?.["type"] === "event-registration") {
    const registrationId = metadata["registrationId"];
    if (!registrationId) {
      logError(
        new Error(
          "Missing registrationId in session metadata (type=event-registration)",
        ),
        {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.MEDIUM,
          context: { operation, sessionId: session.id },
        },
      );
      return null;
    }
    return { kind: "event-registration", registrationId };
  }

  const reservationId = metadata?.["reservationId"];
  if (reservationId) {
    return { kind: "reservation", reservationId };
  }

  logError(
    new Error("Missing or unrecognized payment subject in session metadata"),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { operation, sessionId: session.id },
    },
  );
  return null;
}

/**
 * 予約キャッシュを無効化（共通）
 *
 * webhook では `revalidateTag(tag, CACHE_LIFE.DYNAMIC_DATA)` の SWR ではなく
 * `invalidateSiteWideCacheFromRouteHandler` 経由の `{expire:0}` を使う。
 * Stripe 公式 fulfillment ガイドラインに沿った即時反映のため。
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
function invalidateReservationCache(reservationId: string): void {
  // skipCdnPurge: true — RESERVATIONS + detail + calendar は全て admin-only の
  // private tag (NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist)。CDN 経路に emit されない
  // ため、SITEMAP co-purge を Cloudflare に飛ばす意味が無く、purge quota を
  // 不必要に消費する (Codex PR #945 review 対応)。
  invalidateSiteWideCacheFromRouteHandler(
    [
      CACHE_TAGS.RESERVATIONS,
      getCacheTag.reservations.detail(reservationId),
      getCacheTag.reservations.calendar(),
    ],
    { skipCdnPurge: true },
  );
}

/**
 * 決済完了の atomic claim + 確認メール + cache invalidation。
 *
 * `claimReservationAsPaid` が `null` を返した場合（既に PAID / 重複配信）は
 * 後続副作用を一切実行しない（メール二重送信防止）。
 */
async function fulfillPaymentAtomically(
  reservationId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const reservation = await claimReservationAsPaid(reservationId, {
    stripePaymentIntentId: paymentIntentId,
  });

  // claim 失敗（既に PAID / 予約不在）→ 副作用 skip
  if (!reservation) return;

  invalidateReservationCache(reservationId);

  if (reservation.status === ReservationStatus.CONFIRMED) return;

  // 領収書 (Receipt) の atomic 採番・発行を await で実行する。
  // - fireAndForget 禁止: 失敗が webhook から見えないと Stripe 再送で確定した予約に
  //   Receipt が発行されない silent failure になる (Foundation gap analysis で確定した契約)
  // - VALIDATION エラー (金額 0 / paymentStatus mismatch 等) は業務的にスキップ (Stripe
  //   再送しても解消しないため webhook 側で握り潰し、log で監視)
  // - それ以外 (DB 一時障害 等) は rethrow して Stripe の retry (exponential backoff /
  //   最大 3 日) に委ねる。at-least-once + advisory lock 728353 で二重発行は防止済み。
  try {
    await issueReceiptForReservation(reservation.id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: reservation.id,
        },
      });
    } else {
      throw error;
    }
  }

  fireAndForget(
    sendReservationConfirmationEmail(
      omitUndefined({
        reservationId: reservation.id,
        customerEmail: reservation.guestEmail ?? reservation.customer.email,
        customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
        spaceName: reservation.space.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        totalPrice: reservation.totalPrice,
        location: reservation.space.location?.name,
        notes: reservation.notes ?? undefined,
        icsSequence: reservation.icsSequence,
        userId: reservation.userId,
      }),
    ),
    {
      operation: "sendPaymentConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { reservationId },
    },
  );
}

/**
 * イベント申込キャッシュを無効化（共通）
 *
 * `CACHE_TAGS.EVENTS` は公開イベント一覧/詳細ページの CDN tag にもマップされている
 * （`confirmWaitlistOfferAction` が
 * `invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.EVENT_WAITLIST])` を
 * `skipCdnPurge` 無しで呼ぶのと同じ理由 — Reservation 側の `invalidateReservationCache`
 * とは異なり、こちらは `skipCdnPurge: true` を **渡さない**。予約タグは admin-only の
 * private tag だが、イベントタグは公開ページに影響するため CDN purge が必要）。
 *
 * `CACHE_TAGS.EVENT_WAITLIST` も無条件で含める: waitlist offer 経由の PAID 確定
 * （`isWaitlistOffer` 分岐、WAITLISTED_OFFERED → CONFIRMED）は
 * `confirmWaitlistOfferAction`（無料チケット）と同じ状態遷移の有料版のため対称に
 * 揃える。直接購入（`isWaitlistOffer === false`）では no-op だが、
 * EVENT_WAITLIST に producer が無いため過剰無効化のコストは無い。
 */
function invalidateEventRegistrationCache(): void {
  invalidateSiteWideCacheFromRouteHandler([
    CACHE_TAGS.EVENTS,
    CACHE_TAGS.EVENT_WAITLIST,
  ]);
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
 * capacity race（`confirmWaitlistOfferCommand` が `status: "EXPIRED"` を返す =
 * 決済は成功したが容量再チェックで枠を失った）は `claimEventRegistrationAsPaid`
 * を呼ばない。この状態は `claimEventRegistrationAsFailed`（paymentStatus=FAILED）
 * でも正しく表現できない — 実際には Stripe 決済は成功しているため、FAILED は
 * 会計上の虚偽表示になる。イベント側に自動返金導線が無い（`refunds` API 呼び出しの
 * 実装が無い）ため、CRITICAL ログのみで手動返金・reconciliation に委ねる
 * （Task 9 report の capacity-race decision 参照。follow-up: 自動返金導線の追加）。
 */
async function fulfillEventRegistrationPaymentAtomically(
  registrationId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const isWaitlistOffer = session.metadata?.["source"] === "waitlist-offer";

  if (isWaitlistOffer) {
    let confirmResult: Awaited<ReturnType<typeof confirmWaitlistOfferCommand>>;
    try {
      confirmResult = await confirmWaitlistOfferCommand({
        registrationId,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof DomainError) {
        // 既に CONFIRMED 済み（webhook 再送）/ 他経路で処理済み等、想定内の状態
        // 不一致は冪等に skip する（500 にすると Stripe が無限リトライする）。
        logError(error, {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "stripeWebhookConfirmWaitlistOffer",
            registrationId,
            sessionId: session.id,
          },
        });
        return;
      }
      throw error;
    }

    if (confirmResult.registration.status === "EXPIRED") {
      logError(
        new Error(
          "Waitlist offer payment succeeded but capacity recheck expired the offer — manual refund reconciliation required",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.CRITICAL,
          context: {
            operation: "stripeWebhookWaitlistOfferCapacityRace",
            registrationId,
            sessionId: session.id,
            paymentIntentId,
          },
        },
      );
      return;
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
  try {
    await issueReceiptForEventRegistration(registrationId);
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
    sendEventRegistrationConfirmation({
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
    }),
    {
      operation: "sendWaitlistOfferPaymentConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { registrationId },
    },
  );
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * checkout.session.completed
 *
 * Stripe 公式: session.payment_status を確認する。
 * - "paid": 即時決済（カード等）→ 即座に fulfill
 * - "unpaid": 非同期決済（銀行振込等）→ async_payment_succeeded を待つ
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookCheckoutCompleted",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    const { reservationId } = subject;
    if (session.payment_status === "paid") {
      // 即時決済（カード等）: atomic claim で fulfill
      await fulfillPaymentAtomically(reservationId, session);
    } else {
      // 非同期決済（銀行振込等）: PaymentIntent ID のみ保存
      // paymentStatus は PENDING のまま維持。async_payment_succeeded で fulfill される
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null;

      if (paymentIntentId) {
        await savePaymentIntentId(reservationId, paymentIntentId);
      }

      invalidateReservationCache(reservationId);
    }
    return;
  }

  const { registrationId } = subject;
  if (session.payment_status === "paid") {
    await fulfillEventRegistrationPaymentAtomically(registrationId, session);
  } else {
    // 非同期決済（konbini / customer_balance）: PaymentIntent ID のみ保存。
    // 決済が実際に確定するのは後続の checkout.session.async_payment_succeeded
    // （`handleAsyncPaymentSucceeded` が `fulfillEventRegistrationPaymentAtomically`
    // を呼ぶ — Fix commit, レビュー Important #2 で配線済み）。
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

    if (paymentIntentId) {
      await saveEventRegistrationPaymentIntentId(
        registrationId,
        paymentIntentId,
      );
    }

    invalidateEventRegistrationCache();
  }
}

/**
 * checkout.session.async_payment_succeeded
 *
 * 銀行振込 / konbini 等の非同期決済が成功した場合に発火。
 * checkout.session.completed で "unpaid" だった予約 / イベント申込を fulfill する。
 *
 * この event type は Stripe が非同期決済の成功確定時にのみ送出するため、
 * checkout.session.completed と異なり `session.payment_status` による分岐は
 * 不要（常に確定済み扱いで良い）。event-registration 側は
 * `fulfillEventRegistrationPaymentAtomically` を共有する（waitlist offer は
 * 同関数内で `confirmWaitlistOfferCommand` の容量再チェックを経由し、直接購入は
 * 経由しない — checkout.session.completed と同じ分岐契約）。atomic claim
 * （`paymentStatus not PAID` 相当の WHERE）が二重処理を防ぐため、
 * checkout.session.completed（即時決済）と本 handler（非同期決済）の両方から
 * 同じ registration/reservation に対して呼ばれても安全（Task 9 report 参照）。
 */
async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookAsyncPaymentSucceeded",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    await fulfillPaymentAtomically(subject.reservationId, session);
    return;
  }

  await fulfillEventRegistrationPaymentAtomically(
    subject.registrationId,
    session,
  );
}

/**
 * checkout.session.async_payment_failed
 *
 * 非同期決済が失敗した場合に発火。
 */
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookAsyncPaymentFailed",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
    // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
    const claimed = await claimReservationAsFailed(
      subject.reservationId,
      session.id,
    );
    if (claimed) {
      invalidateReservationCache(subject.reservationId);
    }
    return;
  }

  // WAITLISTED_OFFERED status には触れない（cron `waitlist-expire` が期限切れを
  // 処理する）。paymentStatus のみ FAILED に claim する。
  const claimed = await claimEventRegistrationAsFailed(
    subject.registrationId,
    session.id,
  );
  if (claimed) {
    invalidateEventRegistrationCache();
  }
}

/**
 * checkout.session.expired
 *
 * Checkout Session の有効期限切れ。paymentStatus → FAILED。
 * PAID / REFUNDED 済みは `claimReservationAsFailed` 内で skip される。
 */
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookCheckoutExpired",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
    // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
    const claimed = await claimReservationAsFailed(
      subject.reservationId,
      session.id,
    );
    if (claimed) {
      invalidateReservationCache(subject.reservationId);
    }
    return;
  }

  // WAITLISTED_OFFERED status には触れない（cron `waitlist-expire` が期限切れを
  // 処理する）。paymentStatus のみ FAILED に claim する。
  const claimed = await claimEventRegistrationAsFailed(
    subject.registrationId,
    session.id,
  );
  if (claimed) {
    invalidateEventRegistrationCache();
  }
}

/**
 * charge.refunded
 *
 * 返金完了。stripePaymentIntentId で予約を検索し、charge の amount / amount_refunded で
 * partial / full を判定して paymentStatus を遷移する。Refund child は idempotent write。
 *
 * Codex P1 (PR #1125, comment 3588489513) 対応: 旧実装は unconditional REFUNDED flip で、
 * `refundReservationPaymentCommand` が設定した PARTIALLY_REFUNDED を上書きしていた。
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;

  if (!paymentIntentId) {
    logError(new Error("Missing payment_intent on charge.refunded event"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "stripeWebhookChargeRefunded",
        chargeId: charge.id,
      },
    });
    return;
  }

  // Stripe webhook payload の `charge.refunds` は default で 10 件まで含まれる (docs 参照)。
  // 通常は 1 event = 1 新規 refund。data[0] が最新 (Stripe の list は desc order)。
  const latestRefundData = charge.refunds?.data[0];
  const latestRefund = latestRefundData
    ? { id: latestRefundData.id, amount: latestRefundData.amount }
    : null;

  // 1. Reservation 経路をまず try
  const reservation = await findReservationByPaymentIntent(paymentIntentId);
  if (reservation) {
    await applyChargeRefundIdempotent({
      reservationId: reservation.id,
      chargeAmount: charge.amount,
      amountRefunded: charge.amount_refunded,
      latestRefund,
    });
    invalidateReservationCache(reservation.id);
    return;
  }

  // 2. EventRegistration 経路 (task #6): Reservation で見つからなければ event 側を検索。
  const registration =
    await findEventRegistrationByPaymentIntent(paymentIntentId);
  if (registration) {
    await applyEventChargeRefundIdempotent({
      registrationId: registration.id,
      chargeAmount: charge.amount,
      amountRefunded: charge.amount_refunded,
      latestRefund,
    });
    invalidateEventRegistrationCache();
    return;
  }

  logError(
    new Error(
      "No reservation or event registration found for payment_intent on charge.refunded",
    ),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "stripeWebhookChargeRefunded",
        paymentIntentId,
      },
    },
  );
}
