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

  try {
    const session = await createWaitlistOfferCheckoutSessionCommand({
      registrationId: verified.registrationId,
      offerToken: token,
    });
    // 外部 (Stripe) への redirect は POST-safety の 303 (See Other) を使う。
    // EXPIRED_PATH 等の内部ソフトリダイレクトの 302 とは意図的に区別する。
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    // DomainError（既に決済処理が開始済み / Stripe 未設定等の運用上のエラー）は
    // 500 を返さずソフトに expired へフォールバックする（機能停止であって
    // 内部エラーではない — Task 8 の既存方針を踏襲）。想定外の例外はそのまま
    // 投げて 500 で可視化する。
    if (error instanceof DomainError) {
      return NextResponse.redirect(new URL(EXPIRED_PATH, request.url), 302);
    }
    throw error;
  }
}
