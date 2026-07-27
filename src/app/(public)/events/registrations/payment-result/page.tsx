/**
 * 有料イベント申込の Stripe Checkout 戻り先（決済結果バナー）。
 *
 * `/events/[slug]?payment=...` は公開 CDN キャッシュ対象のため個人の
 * paymentStatus を載せられない。`/events/registrations/:path*` は
 * next.config で `private, no-store` のためここに分離する。
 */

import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  getEventRegistrationPaymentBannerContext,
  resolveEventPaymentBannerMessage,
} from "@/shared/domain/events/payment-banner";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { EventStatusNotice } from "@/app/(public)/events/[slug]/_components/event-status-notice";

export const metadata: Metadata = {
  title: "決済結果",
  robots: { index: false, follow: false },
};

interface PaymentResultPageProps {
  readonly searchParams: Promise<{
    payment?: string;
    registration?: string;
    slug?: string;
  }>;
}

export default async function EventRegistrationPaymentResultPage({
  searchParams,
}: PaymentResultPageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");
  await requireFeatureEnabled("payment");

  const params = await searchParams;
  const payment = params.payment;
  const registrationId = params.registration;
  const slug = params.slug;

  if (!payment || !registrationId || !slug) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <EventStatusNotice
          variant="muted"
          title="決済結果を表示できません"
          description="リンクが不完全です。マイページまたは確認メールから状況をご確認ください。"
        />
        <p className="mt-6 text-sm">
          <Link
            href="/mypage/events"
            className="underline decoration-border underline-offset-4"
          >
            マイページのイベント申込へ
          </Link>
        </p>
      </main>
    );
  }

  const registration = await getEventRegistrationPaymentBannerContext({
    registrationId,
    eventSlug: slug,
  });
  const message = resolveEventPaymentBannerMessage({ payment, registration });

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      {message ? (
        <EventStatusNotice
          variant={message.variant}
          title={message.title}
          description={message.description}
        />
      ) : (
        <EventStatusNotice
          variant="muted"
          title="決済結果を確認できませんでした"
          description="マイページまたは確認メールから状況をご確認ください。"
        />
      )}
      <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row">
        <Link
          href={`/events/${slug}`}
          className="underline decoration-border underline-offset-4"
        >
          イベントページへ戻る
        </Link>
        <Link
          href={`/mypage/events/${registrationId}`}
          className="underline decoration-border underline-offset-4"
        >
          マイページのイベント申込詳細へ
        </Link>
      </div>
    </main>
  );
}
