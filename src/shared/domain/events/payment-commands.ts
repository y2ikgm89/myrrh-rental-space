import "server-only";

import { PaymentStatus, RegistrationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getStripeClient } from "@/shared/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { isStripePaymentMethodType } from "@/shared/lib/stripe-payment-methods";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// Reservation の payment-commands と共通の unit_amount 通貨変換
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

function toStripeUnitAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amount
    : Math.round(amount * 100);
}

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
