/**
 * イベント waitlist 繰り上げ当選の有料チケット決済起動 Route Handler。
 *
 * `getEventWaitlistOfferPaymentContext` が発行する
 * `/events/waitlist/checkout/[token]` の着地先。有効な WAITLISTED_OFFERED +
 * 有料チケットの場合のみ Stripe Checkout Session へリダイレクトする。
 *
 * @module app/(public)/events/waitlist/checkout/[token]
 */

import { NextResponse } from "next/server";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { verifyWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { getEventRegistrationForConfirm } from "@/shared/domain/events/waitlist-queries";
import { createWaitlistOfferCheckoutSessionCommand } from "@/shared/domain/events/payment-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { publicQueryRateLimiter, getClientIp } from "@/shared/lib/rate-limit";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const EXPIRED_PATH = "/events/waitlist/expired";
const CHECKOUT_ERROR_PATH = "/events/waitlist/checkout-error";

/**
 * `createWaitlistOfferCheckoutSessionCommand` が投げる `VALIDATION` の中で
 * 「対象がもう WAITLISTED_OFFERED ではない」(= genuine expiry と同義。
 * EXPIRED 化済み / 既に CONFIRMED 済み / CANCELLED 済み等) ことを示すメッセージ。
 * 同コマンドの他の `VALIDATION`（Stripe 未設定・支払方法未有効化・チケット価格
 * 欠落・確定期限情報欠落）は運営側の設定不備/データ異常であり、genuine expiry
 * と混同してはならない（`payment-commands.ts` の該当 throw 箇所参照。
 * `DomainError` はメッセージ以外に細分コードを持たないため、ここでの文字列一致は
 * 意図的な密結合 — メッセージ文言を変える場合はこの定数も合わせて更新する）。
 */
const OFFER_NOT_ACTIVE_MESSAGE =
  "この繰り上げ当選は確定待ちの状態ではありません";

/**
 * Codex P1-A（PR#1080 レビュー）: `createWaitlistOfferCheckoutSessionCommand` が
 * authoritative 再読み込み後に「offer 自身の expiresAt が既に過去」を検出した
 * ときに投げる `VALIDATION` メッセージ。cron がまだ EXPIRED 化していない場合や
 * Stripe `expires_at` の 30 分下限フロアで session だけが生き残っている場合に
 * 到達する、genuine expiry の一種（`OFFER_NOT_ACTIVE_MESSAGE` と同じ
 * EXPIRED_PATH へ誘導すべきで、CHECKOUT_ERROR_PATH の「system」扱いにしてはならない）。
 */
const OFFER_EXPIRED_MESSAGE = "この繰り上げ当選は既に期限切れです";

function isGenuineOfferExpiry(error: DomainError): boolean {
  if (error.code === "NOT_FOUND") return true;
  return (
    error.code === "VALIDATION" &&
    (error.message === OFFER_NOT_ACTIVE_MESSAGE ||
      error.message === OFFER_EXPIRED_MESSAGE)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  // feature module OFF は 404 (notFound() は Route Handler でも 404 レスポンスを
  // 生成する — Server Component 限定ではない。公式 JSDoc: "In a Route Handler or
  // Server Action, it will serve a 404 to the caller.")
  await requireFeatureEnabled("events");

  // GET エンドポイントへの token 総当たりを牽制する（confirm page と同方針）。
  const clientIp = getClientIp(request);
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
  }

  const { token } = await params;
  const verified = verifyWaitlistOfferToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
  }

  const registration = await getEventRegistrationForConfirm(
    verified.registrationId,
  );
  if (
    !registration ||
    registration.status !== RegistrationStatus.WAITLISTED_OFFERED
  ) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
  }

  if (registration.ticketPrice === 0) {
    // 誤配線 fallback: 無料チケットなのに有料 checkout URL を踏んだ場合は
    // 無料確定ページへ誘導する（内部リダイレクトのため 302）。
    const confirmUrl = new URL("/events/waitlist/confirm", request.url);
    confirmUrl.searchParams.set("token", token);
    return NextResponse.redirect(confirmUrl, 302);
  }

  try {
    const session = await createWaitlistOfferCheckoutSessionCommand({
      registrationId: verified.registrationId,
      offerToken: token,
    });
    // 外部 (Stripe) への redirect は POST-safety の 303 (See Other) を使う。
    // EXPIRED_PATH 等の内部ソフトリダイレクトの 302 とは意図的に区別する。
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    // DomainError は 3 種類に区別してソフトランディングへ振り分ける（final
    // review I2 — 旧実装は全 DomainError を一律 expired に丸めており、
    // 「別タブで決済処理が進行中」や「Stripe 未設定」を「招待が期限切れ」と
    // 誤表示していた）。想定外の非 DomainError 例外はそのまま投げて 500 で可視化する
    // （Task 8 の既存方針を踏襲）。
    if (error instanceof DomainError) {
      if (isGenuineOfferExpiry(error)) {
        return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
      }

      if (error.code === "CONFLICT") {
        // 既に別のタブ/ウィンドウが claim 済み（決済処理が進行中）。
        const url = new URL(CHECKOUT_ERROR_PATH, request.url);
        url.searchParams.set("reason", "conflict");
        return NextResponse.redirect(url, 302);
      }

      // 上記以外（Stripe 未設定・支払方法未有効化・チケット価格欠落・確定期限
      // 情報欠落・Stripe API 呼出自体の失敗等）は運営側の設定不備/インフラ障害。
      // 「期限切れ」と誤表示すると顧客にもサポートにも実態が伝わらないため、
      // CRITICAL で可視化した上でソフトランディングへ誘導する。
      logError(error, {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "waitlistOfferCheckoutRedirect",
          registrationId: verified.registrationId,
          domainErrorCode: error.code,
        },
      });
      const url = new URL(CHECKOUT_ERROR_PATH, request.url);
      url.searchParams.set("reason", "system");
      return NextResponse.redirect(url, 302);
    }
    throw error;
  }
}
