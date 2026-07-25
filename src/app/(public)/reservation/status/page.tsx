import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getReservationForGuestStatus } from "@/shared/domain/reservations/customer-queries";
import {
  buildGuestReceiptDownloadHref,
  buildGuestCancelHref,
  resolveGuestStatusAccess,
  shouldShowGuestClaimLink,
} from "@/shared/domain/reservations/guest-status-view";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { formatPrice } from "@/shared/lib/pricing/format";
import { getAppUrl } from "@/shared/lib/constants";
import { toAppRoute } from "@/shared/lib/typed-routes";
import {
  getValidPaymentStatus,
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { getCalendarEmailSettings } from "@/shared/domain/settings/queries/notification";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { PasscodeReveal } from "@/app/(public)/_shared/components/passcode-reveal";
import { getPasscodeRevealState } from "@/shared/domain/smart-lock/customer-passcode-queries";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";

// トークンゲートのユーティリティページ。検索結果に出さない（complete / cancel と同方針）。
export const metadata: Metadata = {
  title: "予約ステータス",
  robots: { index: false, follow: false },
};

export default async function GuestReservationStatusPage(): Promise<ReactElement> {
  await connection();

  await requireFeatureEnabled("reservation");

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);

  const cookieStore = await cookies();
  const token =
    cookieStore.get(RESERVATION_STATUS_TOKEN_COOKIE_NAME)?.value ?? null;

  const access = resolveGuestStatusAccess({
    token,
    rateLimitSuccess: limit.success,
    now: reservationDeadlineNow(),
  });

  if (access.kind === "rate_limited") {
    return <TooManyRequestsView />;
  }

  if (access.kind === "invalid") {
    return <InvalidLinkView />;
  }

  const [reservation, user, calendarSettings, deadlineSettings] =
    await Promise.all([
      getReservationForGuestStatus(access.reservationId),
      getCurrentCustomerUser(),
      getCalendarEmailSettings(),
      getReservationDeadlineSettings(),
    ]);

  if (!reservation) {
    return <InvalidLinkView />;
  }

  const now = reservationDeadlineNow();
  const address = reservation.space.location?.address ?? null;
  const paymentStatus = getValidPaymentStatus(reservation.paymentStatus);
  const reservationStatusLabel = isValidReservationStatus(reservation.status)
    ? RESERVATION_STATUS_LABELS[reservation.status]
    : reservation.status;
  const isCancelled = reservation.status === ReservationStatus.CANCELLED;
  const receiptSerialNo = reservation.receipt?.serialNo ?? null;
  const receiptDownloadHref = receiptSerialNo
    ? buildGuestReceiptDownloadHref(receiptSerialNo)
    : null;
  const cancelHref = buildGuestCancelHref({
    reservationId: reservation.id,
    status: reservation.status,
    startTime: reservation.startTime,
    cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
    now,
  });
  const claimUrl = shouldShowGuestClaimLink({
    customerUserId: reservation.customer.userId,
    isLoggedIn: user != null,
  })
    ? `/claim/reservation?token=${createReservationClaimToken(reservation.id)}`
    : null;
  const calendarUrls =
    !isCancelled && calendarSettings.addToCalendarLinksEnabled
      ? buildAddToCalendarUrls({
          summary: `【予約】${reservation.space.name}`,
          description: [
            `予約番号: ${reservation.id.slice(0, 8).toUpperCase()}`,
            `スペース: ${reservation.space.name}`,
          ].join("\n"),
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          ...(address ? { location: address } : {}),
          icsDownloadUrl: `${getAppUrl()}/api/calendar/reservation/${reservation.id}`,
        })
      : null;
  const passcodeRevealState = await getPasscodeRevealState(
    reservation.id,
    { kind: "status-token", reservationId: reservation.id },
    { now },
  );

  return (
    <Layout>
      <div className="text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          Reservation
        </p>
        <Heading level={1}>予約ステータス</Heading>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          ご予約内容とお支払い状況をご確認いただけます。
        </p>
      </div>

      <div className="border border-border">
        <div className="border-b border-border p-4 sm:p-6">
          <Heading level={2} className="!text-xl">
            {reservation.space.name}
          </Heading>
          {address && (
            <p className="mt-1 text-sm text-muted-foreground">{address}</p>
          )}
        </div>

        <dl className="px-4 sm:px-6">
          <DetailRow label="利用日">
            {formatSerializedDate(reservation.startTime, {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </DetailRow>
          <DetailRow label="利用時間">
            {formatSerializedDate(reservation.startTime, {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            〜{" "}
            {formatSerializedDate(reservation.endTime, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </DetailRow>
          <DetailRow label="合計金額">
            {formatPrice(reservation.totalPrice, "未定")}
          </DetailRow>
          <DetailRow label="予約状態">{reservationStatusLabel}</DetailRow>
          <DetailRow label="お支払い">
            {PAYMENT_STATUS_LABELS[paymentStatus]}
          </DetailRow>
        </dl>

        <PasscodeReveal
          reservationId={reservation.id}
          initialState={passcodeRevealState}
        />

        {receiptDownloadHref && (
          <div className="border-t border-border px-4 py-4 sm:px-6">
            <p className="mb-3 text-sm text-muted-foreground">
              適格請求書 (領収書) は PDF でダウンロードできます。
            </p>
            <a
              href={toAppRoute(receiptDownloadHref)}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              領収書をダウンロード
            </a>
          </div>
        )}
      </div>

      {calendarUrls && (
        <div className="border border-border p-4 sm:p-6">
          <AddToCalendar urls={calendarUrls} variant="public" />
        </div>
      )}

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
                この予約をキャンセルする
              </a>
            </li>
          )}
          {user ? (
            <li>
              <Link
                href={toAppRoute("/mypage")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                マイページ
              </Link>
              から予約の確認ができます。
            </li>
          ) : (
            <li>
              会員の方は
              <Link
                href={toAppRoute("/mypage")}
                className="underline underline-offset-4 hover:text-foreground"
              >
                マイページ
              </Link>
              から予約を確認できます。
            </li>
          )}
          {claimUrl && (
            <li>
              <a
                href={claimUrl}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Google/LINEでこの予約をマイページに追加する
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

interface DetailRowProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-none sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-36">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
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
              href={toAppRoute("/mypage")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            から予約を確認できます。
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
