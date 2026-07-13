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
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { publicQueryRateLimiter, getClientIp } from "@/shared/lib/rate-limit";

const EXPIRED_PATH = "/events/waitlist/expired";

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

  // TODO(task-9): createWaitlistOfferCheckoutSessionCommand({registrationId,
  // offerToken: token}) で Stripe Checkout Session を作成し、
  // NextResponse.redirect(session.url, 303) で実際の Stripe 決済へ誘導する。
  // Task 9 未実装のため、現時点では有料チケットの繰り上げ当選確定を
  // ソフトに expired へフォールバックさせる（機能停止であって 404/500 は返さない）。
  return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
}
