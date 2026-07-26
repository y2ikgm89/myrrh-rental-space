import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { getEventRegistrationForGuestStatus } from "@/shared/domain/events/registration-queries";
import { isEventVirtualAccessible } from "@/shared/domain/events/venue";
import {
  buildGuestCancelHref,
  buildGuestReceiptDownloadHref,
  resolveGuestEventRegistrationStatusAccess,
  shouldShowGuestClaimLink,
} from "@/shared/domain/events/guest-status-view";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import {
  checkGuestStatusMemberOwnership,
  GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE,
} from "@/shared/lib/guest-status-member-ownership";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { formatPrice } from "@/shared/lib/pricing/format";
import { toAppRoute } from "@/shared/lib/typed-routes";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { DetailRow } from "@/app/(public)/_shared/components/detail-row";
import { EventMeetingUrlRow } from "@/app/(public)/_shared/components/event-meeting-url-row";
import { ReceiptDownloadSection } from "@/app/(public)/_shared/components/receipt-download-section";
import { GuestStatusMemberOwnershipMismatchView } from "@/app/(public)/_shared/components/guest-status-member-ownership-mismatch-view";

// トークンゲートのユーティリティページ。検索結果に出さない（cancel と同方針）。
// robots.ts は `/events/registrations/` でまとめて disallow 済み。
export const metadata: Metadata = {
  title: "イベント申込ステータス",
  robots: { index: false, follow: false },
};

export default async function GuestEventRegistrationStatusPage(): Promise<ReactElement> {
  await connection();

  // events OFF 時は 404。閲覧のみのため payment feature は要求しない。
  await requireFeatureEnabled("events");

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);

  const cookieStore = await cookies();
  const token =
    cookieStore.get(EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME)?.value ?? null;

  const now = eventDeadlineNow();
  const access = resolveGuestEventRegistrationStatusAccess({
    token,
    rateLimitSuccess: limit.success,
    now,
  });

  if (access.kind === "rate_limited") {
    return <TooManyRequestsView />;
  }

  if (access.kind === "invalid") {
    return <InvalidLinkView />;
  }

  const [registration, user] = await Promise.all([
    getEventRegistrationForGuestStatus(access.registrationId),
    getCurrentCustomerUser(),
  ]);

  if (!registration) {
    return <InvalidLinkView />;
  }

  const sessionCustomer = user ? await getCustomerByUserId(user.id) : null;
  const ownership = checkGuestStatusMemberOwnership({
    sessionCustomerId: sessionCustomer?.id ?? null,
    resourceCustomerId: registration.customerId,
  });
  if (ownership.kind === "mismatch") {
    return (
      <GuestStatusMemberOwnershipMismatchView
        message={
          GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE
        }
        mypageHref="/mypage/events"
      />
    );
  }

  const paymentStatus = getValidPaymentStatus(registration.paymentStatus);
  const receiptDownloadHref = registration.receiptSerialNo
    ? buildGuestReceiptDownloadHref(registration.receiptSerialNo)
    : null;
  const cancelHref = buildGuestCancelHref({
    registrationId: registration.id,
    status: registration.status,
    slotStartAt: registration.slot.startAt,
    now,
  });
  const claimUrl = shouldShowGuestClaimLink({
    customerId: registration.customerId,
    isLoggedIn: user != null,
  })
    ? `/claim/event-registration?token=${createEventRegistrationClaimToken(registration.id)}`
    : null;
  const isVirtual = isEventVirtualAccessible(registration.event);
  const isConfirmed = registration.status === RegistrationStatus.CONFIRMED;

  return (
    <Layout>
      <div className="text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          Event registration
        </p>
        <Heading level={1}>イベント申込ステータス</Heading>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          お申込内容とお支払い状況をご確認いただけます。
        </p>
      </div>

      <div className="border border-border">
        <div className="border-b border-border p-4 sm:p-6">
          <Heading level={2} className="!text-xl">
            {registration.event.title}
          </Heading>
        </div>

        <dl className="px-4 sm:px-6">
          <DetailRow label="開催日">
            {formatSerializedDate(registration.slot.startAt, {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </DetailRow>
          <DetailRow label="開催時間">
            {formatSerializedDate(registration.slot.startAt, {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            〜{" "}
            {formatSerializedDate(registration.slot.endAt, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </DetailRow>
          {registration.event.location && (
            <DetailRow label="場所">{registration.event.location}</DetailRow>
          )}
          {registration.event.locationSecondary && (
            <DetailRow label="開催形態">
              {registration.event.locationSecondary}
            </DetailRow>
          )}
          <DetailRow label="チケット">{registration.ticketName}</DetailRow>
          <DetailRow label="参加人数">{registration.quantity}名</DetailRow>
          <DetailRow label="合計金額">
            {formatPrice(registration.ticketTotalPrice, "無料")}
          </DetailRow>
          <DetailRow label="申込状態">
            {REGISTRATION_STATUS_LABELS[registration.status]}
          </DetailRow>
          <DetailRow label="お支払い">
            {PAYMENT_STATUS_LABELS[paymentStatus]}
          </DetailRow>
          {isVirtual && (
            <EventMeetingUrlRow
              meetingUrl={registration.event.meetingUrl}
              isConfirmed={isConfirmed}
            />
          )}
        </dl>

        {receiptDownloadHref && (
          <ReceiptDownloadSection href={toAppRoute(receiptDownloadHref)} />
        )}
      </div>

      <div className="border border-border p-4 sm:p-6">
        <Heading level={2} className="!text-base">
          次のステップ
        </Heading>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {cancelHref && (
            <li>
              <a
                href={cancelHref}
                className="underline underline-offset-4 hover:text-foreground"
              >
                この申込をキャンセルする
              </a>
            </li>
          )}
          {user ? (
            <li>
              <Link
                href={toAppRoute("/mypage/events")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                マイページ
              </Link>
              から申込の確認ができます。
            </li>
          ) : (
            <li>
              会員の方は
              <Link
                href={toAppRoute("/mypage/events")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                マイページ
              </Link>
              から申込を確認できます。
            </li>
          )}
          {claimUrl && (
            <li>
              <a
                href={claimUrl}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Google/LINEでこの申込をマイページに追加する
              </a>
            </li>
          )}
          <li>
            ご不明な点は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              お問い合わせ
            </Link>
            ください。
          </li>
        </ul>
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidLinkView(): ReactElement {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リンクが無効または期限切れです
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが正しくないか、有効期限が切れている可能性があります。
        </p>
        <Stack gap="sm" className="mt-4 text-sm text-muted-foreground">
          <p>
            会員の方は
            <Link
              href={toAppRoute("/mypage/events")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            から申込を確認できます。
          </p>
          <p>
            会員でない方は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            よりご連絡ください。
          </p>
        </Stack>
      </div>
    </Layout>
  );
}

function TooManyRequestsView(): ReactElement {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リクエストが多すぎます
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          しばらく時間をおいてから再度お試しください。
        </p>
      </div>
    </Layout>
  );
}
