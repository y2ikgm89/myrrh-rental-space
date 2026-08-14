/**
 * イベント waitlist 繰り上げ当選の有料チケット決済起動 Route Handler。
 *
 * `getEventWaitlistOfferPaymentContext` が発行する
 * `/events/waitlist/checkout?token=...` は `proxy.ts` が HttpOnly cookie に
 * 転写してから本 route に到達する。有効な WAITLISTED_OFFERED + 有料チケットの
 * 場合のみ Stripe Checkout Session へリダイレクトする。
 *
 * 冒頭 `await connection()` で build prerender を skip する（静的 path のため
 * `[token]` 時代と違い params だけでは動的化されない。`requireFeatureEnabled` の
 * DB 読取を build 時に走らせない）。
 *
 * @module app/(public)/events/waitlist/checkout
 */

import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { WAITLIST_OFFER_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/waitlist-offer-token-cookie-name";
import { verifyWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { getEventRegistrationForConfirm } from "@/shared/domain/events/waitlist-queries";
import { createWaitlistOfferCheckoutSessionCommand } from "@/shared/domain/events/payment-commands";
import { classifyWaitlistOfferCheckoutError } from "@/shared/domain/events/classify-waitlist-offer-checkout-error";
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

export async function GET(request: Request): Promise<NextResponse> {
  await connection();
  // feature module OFF は 404 (notFound() は Route Handler でも 404 レスポンスを
  // 生成する — Server Component 限定ではない。公式 JSDoc: "In a Route Handler or
  // Server Action, it will serve a 404 to the caller.")
  await requireFeatureEnabled("events");
  await requireFeatureEnabled("payment");

  // GET エンドポイントへの token 総当たりを牽制する（confirm page と同方針）。
  const clientIp = getClientIp(request);
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
  }

  // proxy が `?token=` を HttpOnly cookie に転写済み。URL クエリは残さない。
  const cookieStore = await cookies();
  const token =
    cookieStore.get(WAITLIST_OFFER_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
  }
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
    // DomainError は classifyWaitlistOfferCheckoutError で expired /
    // conflict / too-late / system に振り分ける。想定外の非 DomainError
    // 例外はそのまま投げて 500 で可視化する。
    if (error instanceof DomainError) {
      const disposition = classifyWaitlistOfferCheckoutError(error);
      if (disposition.destination === "expired") {
        return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
      }

      // system 以外（conflict / too-late）は想定内の業務条件なので CRITICAL
      // にしない。too-late を expired に丸めると「既に期限切れ」と誤案内する。
      if (disposition.severity === ErrorSeverity.CRITICAL) {
        logError(error, {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.CRITICAL,
          context: {
            operation: "waitlistOfferCheckoutRedirect",
            registrationId: verified.registrationId,
            domainErrorCode: error.code,
          },
        });
      }
      const url = new URL(CHECKOUT_ERROR_PATH, request.url);
      url.searchParams.set("reason", disposition.reason);
      return NextResponse.redirect(url, 302);
    }
    throw error;
  }
}
