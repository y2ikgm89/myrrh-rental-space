import "server-only";

import {
  AuditAction,
  PaymentStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getStripeClient } from "@/shared/lib/stripe";
import {
  fromStripeUnitAmount,
  toStripeUnitAmount,
} from "@/shared/lib/stripe-shared";
import { isStripePaymentMethodType } from "@/shared/lib/stripe-payment-methods";
import { getAppUrl } from "@/shared/lib/constants";
import { type RefundedByType } from "@/shared/lib/validations/enums/helpers";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * `refundEventRegistrationPaymentCommand` の advisory lock namespace。
 * `.claude/rules/db-domain.md` の registry と一致
 * (Reservation の 728355 と同型、event registration 単位で serialize)。
 */
const EVENT_REFUND_LOCK_NAMESPACE = 728356;

/**
 * EventRegistration の Stripe Checkout Session を作成する (PR#10)。
 *
 * Reservation 側の createCheckoutSessionCommand と同型の設計:
 * - actor assertion (IDOR 防止)
 * - claim-first (Stripe API 呼出の前に UNPAID → PENDING を atomic に確定)
 * - claim 直後に authoritative な ticket.price / 顧客情報を再読み込み
 * - Stripe 失敗時は PENDING → UNPAID revert
 * - session settle は WHERE notIn [PAID, REFUNDED] + PENDING 再 assert
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

  if (registration.paymentStatus !== PaymentStatus.UNPAID) {
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

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
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

  // Claim-first: UNPAID → PENDING を atomic に確定 (edit / 並行 cancel との race を封鎖)。
  // `status: CONFIRMED` も WHERE で assert する (Codex P1 #1026, comment 3567019751):
  // pre-check と claim の間で並行 cancel が走ったケースを DB レベルで塞ぐ。
  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
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
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError("チケット料金が設定されていません", "VALIDATION");
  }

  const authoritativeTotal =
    authoritative.ticket.price * authoritative.quantity;

  try {
    const session = await client.checkout.sessions.create({
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
      // Codex P1 (PR#1026, comment 3567019753): 旧実装の `/events/registrations/{id}`
      // は存在しないルートで Stripe returnee が 404 していた。既存の公開イベント詳細
      // `/events/[slug]` にリダイレクトし、`registration` クエリで status バナー用に
      // 後続 PR がキーできるようにしておく。
      success_url: `${appUrl}/events/${authoritative.event.slug}?payment=success&registration=${registrationId}`,
      cancel_url: `${appUrl}/events/${authoritative.event.slug}?payment=cancelled&registration=${registrationId}`,
    });

    const settled = await prisma.eventRegistration.updateMany({
      where: {
        id: registrationId,
        paymentStatus: {
          notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
        },
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
        paidAmount: authoritativeTotal,
      },
    });
    if (settled.count === 0) {
      // PAID/REFUNDED race — session URL は返す (webhook 冪等性に委任)
      logError(
        new Error(
          "createEventCheckoutSessionCommand: session settled skipped (already PAID/REFUNDED)",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "createEventCheckoutSession",
            registrationId,
          },
        },
      );
    }

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: registration.customerId,
    };
  } catch (error) {
    // Stripe 失敗時は PENDING → UNPAID revert (再試行可能に戻す)
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "createEventCheckoutSession",
        registrationId,
      },
    });
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
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
 *   `createEventCheckoutSessionCommand`（UNPAID のみ許容）より意図的に広くしている
 *   — Task 9 report の deviation 参照
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

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
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

  // Claim-first: WAITLISTED_OFFERED はそのまま、paymentStatus のみ atomic に
  // UNPAID/FAILED → PENDING へ遷移させる（24h offer window 内の再決済を許容）。
  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.WAITLISTED_OFFERED,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.FAILED] },
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
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError("チケット料金が設定されていません", "VALIDATION");
  }

  if (!authoritative.expiresAt) {
    // WAITLISTED_OFFERED は offerNextWaitlistEntryCommand が status 遷移と同時に
    // 必ず expiresAt を設定するため理論上到達しないが、列は nullable なので
    // 型レベルで防御する（non-null assertion は使わない）。「claim 済みだが
    // 期限情報が消えた」異常状態として、上と同じく UNPAID に revert する。
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError("確定期限の情報が取得できませんでした", "VALIDATION");
  }

  // Codex P1-A: claim（UNPAID/FAILED → PENDING）は status: WAITLISTED_OFFERED
  // のみを見ており、offer 自体が既に期限切れ（expiresAt <= now）かどうかを見て
  // いない。hourly cron（waitlist-expire）がまだ EXPIRED 化していないケースや、
  // 下の `expiresAt` 計算コメントにある Stripe `expires_at` の 30 分下限フロアで
  // Stripe session だけが offer 期限より長生きするケースでは、期限切れ後でも
  // checkout session を開始・決済完了できてしまう。決済完了後に webhook が呼ぶ
  // `confirmWaitlistOfferCommand` は現在時刻で改めて expiresAt を判定するため
  // EXPIRED 遷移になり、支払い済みなのに確定できない money-handling 事故になる
  // （PR#1080 Codex P1-A レビュー）。ここで claim 直後に再検証し、既に期限切れ
  // なら PENDING を UNPAID に revert して（cron の通常 EXPIRED 化に委ねる）
  // Stripe セッションを作らない。エラーメッセージは checkout route.ts の
  // `isGenuineOfferExpiry` allowlist と密結合（変更時は両方更新する）。
  const now = new Date();
  if (authoritative.expiresAt.getTime() <= now.getTime()) {
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError("この繰り上げ当選は既に期限切れです", "VALIDATION");
  }

  const authoritativeTotal =
    authoritative.ticket.price * authoritative.quantity;

  try {
    // Codex review Critical #1: Stripe Checkout Session の有効期限を offer 自身の
    // expiresAt（24h 期限）に揃える。Reservation 側 createCheckoutSessionCommand の
    // `expires_at` precedent（本ファイル兄弟 `src/shared/domain/reservations/
    // payment-commands.ts`、Codex P1: PR#1042 の silent orphan 予防）と同じ設計
    // 意図: 揃えないと、cron `waitlist-expire` が offer を先に EXPIRED 化した
    // 後でも Stripe session だけ生き残り、顧客が決済を完了できてしまう。その場合
    // `confirmWaitlistOfferCommand` は WAITLISTED_OFFERED を見つけられず
    // DomainError(NOT_FOUND) を投げ、webhook 側は severity LOW で握り潰す（通常の
    // 重複配信と区別不能）ため `claimEventRegistrationAsPaid` が呼ばれず、
    // paymentStatus が PENDING のまま永久に stuck する「money captured / 確認不能」
    // という金銭事故になる（cron 側は `findExpiredWaitlistOfferCandidates` /
    // `expireAndPromoteWaitlistForEventCommand` 側の paymentStatus PENDING 除外
    // ガードで defense-in-depth 済み）。Stripe 制約で expires_at は作成時刻から
    // 最短 30 分 (`30 * 60`) 必要なため、offer 期限が近い（残り 30 分未満）
    // ケースはその下限をフロアとして採用する（顧客が offer window の最後の
    // 1 分に checkout を開いたエッジケース）。
    const expiresAt = Math.max(
      Math.floor(authoritative.expiresAt.getTime() / 1000),
      Math.floor(Date.now() / 1000) + 30 * 60,
    );

    const session = await client.checkout.sessions.create({
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
    });

    const settled = await prisma.eventRegistration.updateMany({
      where: {
        id: registrationId,
        paymentStatus: {
          notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
        },
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
        paidAmount: authoritativeTotal,
      },
    });
    if (settled.count === 0) {
      // PAID/REFUNDED race — session URL は返す (webhook 冪等性に委任)
      logError(
        new Error(
          "createWaitlistOfferCheckoutSessionCommand: session settled skipped (already PAID/REFUNDED)",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "createWaitlistOfferCheckoutSession",
            registrationId,
          },
        },
      );
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
    // Stripe 失敗時は PENDING → UNPAID revert (再試行可能に戻す)
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "createWaitlistOfferCheckoutSession",
        registrationId,
      },
    });
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

/**
 * EventRegistration の Stripe webhook から呼ばれる atomic PAID 遷移。
 * Reservation の claimReservationAsPaid と同型 (updateMany WHERE で claim)。
 *
 * Codex Cloud Review P1 (PR#1026, comment_id=3567019751): claim は
 * `status: CONFIRMED` も要求する。cancel 経路 (registration-cancel-core.ts) は
 * paymentStatus を触らず status のみ CANCELLED に遷移させるため、paymentStatus
 * だけで claim すると「pending checkout 中に cancel → Stripe 完了 webhook 到達」で
 * CANCELLED な行に PAID が焼き付き、返金導線なしで会計 mismatch を起こす。
 * count===0 の場合は呼び出し側 (webhook handler) が refund reconciliation を kick する。
 */
export async function claimEventRegistrationAsPaid(
  registrationId: string,
  data: { stripePaymentIntentId: string | null },
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * EventRegistration の webhook expired/failed 経路。
 * PAID / REFUNDED / FAILED は上書きしない。
 *
 * `sessionId` 一致必須（Task 9 で追加。Reservation の `claimReservationAsFailed`
 * と同型、Codex PR #1043 P1 対応と同じ理由）。
 * `createWaitlistOfferCheckoutSessionCommand` は 24h offer window 内の再決済
 * （FAILED → PENDING）を許容するため、stale な旧 session の expired/failed webhook
 * が「新しい checkout で作られた PENDING session」を巻き込んで誤って FAILED に
 * 上書きするのを防ぐ。この関数は Task 9 で初めて webhook から呼ばれる
 * （PR#9/10 時点では未配線だった）ため、配線と同時にガードを追加している。
 */
export async function claimEventRegistrationAsFailed(
  registrationId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      stripeCheckoutSessionId: sessionId,
      paymentStatus: {
        notIn: [
          PaymentStatus.PAID,
          PaymentStatus.REFUNDED,
          PaymentStatus.FAILED,
        ],
      },
    },
    data: { paymentStatus: PaymentStatus.FAILED },
  });
  return result.count > 0;
}

/**
 * 非同期決済 (konbini / customer_balance) の `checkout.session.completed` で
 * `payment_status !== "paid"` のとき、PaymentIntent ID のみ保存する
 * (Reservation の `savePaymentIntentId` と同型)。
 *
 * `checkout.session.async_payment_succeeded` の event-registration 配線は
 * Fix commit（レビュー Important #2）で追加済み: 非同期決済が成功すると
 * `fulfillEventRegistrationPaymentAtomically` が呼ばれ `claimEventRegistrationAsPaid`
 * が最終的な `stripePaymentIntentId` を確定させる（新しい webhook payload の
 * `session.payment_intent` から独立して再取得するため、ここで保存した値を
 * 読み返すわけではない）。この関数が保存する ID は PENDING 期間中の admin
 * 可視性のための中間状態。`update`（存在しない id で throw）ではなく
 * `updateMany` を使い、想定外の race（該当行なし）で webhook 全体が
 * 500 化しないようにする。
 */
export async function saveEventRegistrationPaymentIntentId(
  registrationId: string,
  paymentIntentId: string,
): Promise<void> {
  await prisma.eventRegistration.updateMany({
    where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
    data: { stripePaymentIntentId: paymentIntentId },
  });
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
}

export interface RefundEventRegistrationResult {
  refundId: string;
  status: string | null;
  newPaymentStatus:
    typeof PaymentStatus.PARTIALLY_REFUNDED | typeof PaymentStatus.REFUNDED;
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
 * - interactive tx 冒頭で `pg_advisory_xact_lock(EVENT_REFUND_LOCK_NAMESPACE, hashtext(registrationId))`
 * - Stripe API 呼び出しは tx 内 (Reservation 側と同様、正確性優先)、timeout / maxWait: 30_000ms
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
  } = input;

  const stripeSettings = await assertOnlinePaymentAvailable();
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
      // 申込単位 advisory lock (concurrent refund 直列化 + over-refund 防止)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EVENT_REFUND_LOCK_NAMESPACE}::int4, hashtext(${registrationId}))`;

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

      // PAID + PARTIALLY_REFUNDED の両方から返金可能
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
        throw new DomainError(
          "Stripe の決済情報が見つかりません",
          "VALIDATION",
        );
      }

      if (registration.paidAmount === null || registration.paidAmount <= 0) {
        throw new DomainError(
          "受領額が記録されていないイベント申込は返金できません",
          "VALIDATION",
        );
      }

      // 既 refund 累積額 (advisory lock 内で読むので TOCTOU なし)
      const aggregate = await tx.refund.aggregate({
        where: { eventRegistrationId: registrationId },
        _sum: { amount: true },
      });
      const cumulativeSoFar = aggregate._sum.amount ?? 0;
      const remaining = registration.paidAmount - cumulativeSoFar;

      if (remaining <= 0) {
        throw new DomainError(
          "このイベント申込は既に全額返金済みです",
          "VALIDATION",
        );
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
      const willBeFullyRefunded = newCumulative === registration.paidAmount;

      // Stripe refund (idempotent、tx 内で lock 保持しつつ実行)
      let refund;
      try {
        refund = await client.refunds.create(
          {
            payment_intent: registration.stripePaymentIntentId,
            amount: toStripeUnitAmount(amount, stripeCurrency),
            ...(reason ? { metadata: { reason } } : {}),
          },
          {
            idempotencyKey: `event-registration-refund-${registrationId}-${newCumulative}`,
          },
        );
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "refundEventRegistrationPayment",
            registrationId,
          },
        });
        throw new DomainError(
          "返金処理に失敗しました。しばらく経ってからお試しください。",
          "UNEXPECTED",
        );
      }

      // Belt-and-suspenders: webhook (charge.refunded) が先に同 stripeRefundId で
      // Refund を書いていた場合、@unique(stripeRefundId) で二重 insert が reject される。
      // Codex PR #1145 追加指摘 (P2): Reservation 側と同型の race を排除するため upsert 化
      // (`update: {}` で既存 = webhook 経由の書込を上書きしない belt-and-suspenders 契約は不変)。
      await tx.refund.upsert({
        where: { stripeRefundId: refund.id },
        create: {
          eventRegistrationId: registrationId,
          amount,
          ...(reason ? { reason } : {}),
          stripeRefundId: refund.id,
          refundedByType: actorType,
        },
        update: {},
      });

      // paymentStatus 遷移 (updateMany で status guard)
      await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
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
        newPaymentStatus: willBeFullyRefunded
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
        cumulativeAmount: newCumulative,
        refundAmount: amount,
      } satisfies RefundEventRegistrationResult;
    },
    {
      timeout: 30_000,
      maxWait: 30_000,
    },
  );

  // AuditLog (tx 外)
  await createAuditLogRecord({
    ...(actorUserId ? { userId: actorUserId } : {}),
    action: AuditAction.UPDATE,
    resource: "eventRegistration",
    resourceId: registrationId,
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
    },
  });

  return result;
}

/**
 * stripePaymentIntentId で EventRegistration を検索
 * (`findReservationByPaymentIntent` の event 対称版)。
 */
export async function findEventRegistrationByPaymentIntent(
  paymentIntentId: string,
) {
  return prisma.eventRegistration.findFirst({
    where: {
      stripePaymentIntentId: paymentIntentId,
      event: { deletedAt: null },
    },
    select: { id: true, paymentStatus: true, paidAmount: true },
  });
}

/**
 * `charge.refunded` webhook から呼ぶ event registration 版の idempotent refund 反映。
 *
 * Reservation 側 `applyChargeRefundIdempotent` (payment-queries.ts) の対称版:
 * - Stripe charge の `amount` / `amount_refunded` で partial/full を判定
 * - Refund child table への idempotent write (`stripeRefundId @unique`)
 * - EventRegistration.paymentStatus を PARTIALLY_REFUNDED / REFUNDED に atomic 遷移
 */
export async function applyEventChargeRefundIdempotent(input: {
  readonly registrationId: string;
  readonly chargeAmount: number;
  readonly amountRefunded: number;
  readonly currency: string;
  readonly latestRefund: {
    readonly id: string;
    readonly amount: number;
  } | null;
}): Promise<void> {
  const {
    registrationId,
    chargeAmount,
    amountRefunded,
    currency,
    latestRefund,
  } = input;

  if (latestRefund) {
    // Reservation 側と同型: upsert で atomic 化 (PR #1126 P2 対応、両経路 bundle)。
    // Stripe unit_amount からアプリ単位への逆変換 (PR #1130 P2、PR #1126 P1 と同型) も継続。
    await prisma.refund.upsert({
      where: { stripeRefundId: latestRefund.id },
      create: {
        eventRegistrationId: registrationId,
        amount: fromStripeUnitAmount(latestRefund.amount, currency),
        stripeRefundId: latestRefund.id,
        refundedByType: "STRIPE_DASHBOARD",
      },
      update: {},
    });
  }

  const isFullRefund = amountRefunded >= chargeAmount;
  const newStatus = isFullRefund
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;

  await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
    },
    data: { paymentStatus: newStatus },
  });
}
