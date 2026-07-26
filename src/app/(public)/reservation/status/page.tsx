import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { Heading } from "@/public/components/design-system/heading";
import { StatusHubInvalidLinkView } from "@/app/(public)/_shared/components/status-hub/status-hub-invalid-link-view";
import { StatusHubShell } from "@/app/(public)/_shared/components/status-hub/status-hub-shell";
import { StatusHubTooManyRequestsView } from "@/app/(public)/_shared/components/status-hub/status-hub-too-many-requests-view";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getReservationForGuestStatus } from "@/shared/domain/reservations/customer-queries";
import {
  buildGuestReceiptDownloadHref,
  buildGuestCancelHref,
  buildGuestEditHref,
  resolveGuestStatusAccess,
  shouldShowGuestClaimLink,
} from "@/shared/domain/reservations/guest-status-view";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import {
  checkGuestStatusMemberOwnership,
  GUEST_STATUS_RESERVATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE,
} from "@/shared/lib/guest-status-member-ownership";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { formatPrice } from "@/shared/lib/pricing/format";
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
import { DetailRow } from "@/app/(public)/_shared/components/detail-row";
import { PasscodeReveal } from "@/app/(public)/_shared/components/passcode-reveal";
import { ReceiptDownloadSection } from "@/app/(public)/_shared/components/receipt-download-section";
import { GuestStatusMemberOwnershipMismatchView } from "@/app/(public)/_shared/components/guest-status-member-ownership-mismatch-view";
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

const REDIRECT_REASONS = ["status", "deadline", "discount", "payment"] as const;
type RedirectReason = (typeof REDIRECT_REASONS)[number];
const REDIRECT_REASON_SET = new Set<string>(REDIRECT_REASONS);
function isRedirectReason(value: string): value is RedirectReason {
  return REDIRECT_REASON_SET.has(value);
}

interface PageProps {
  readonly searchParams: Promise<SearchParams>;
}

export default async function GuestReservationStatusPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  await requireFeatureEnabled("reservation");

  const sp = await searchParams;
  const reasonRaw = typeof sp["reason"] === "string" ? sp["reason"] : null;
  const reason: RedirectReason | null =
    reasonRaw && isRedirectReason(reasonRaw) ? reasonRaw : null;

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
    return <StatusHubTooManyRequestsView />;
  }

  if (access.kind === "invalid") {
    return (
      <StatusHubInvalidLinkView
        mypageHref="/mypage"
        memberResourceLabel="予約"
      />
    );
  }

  const [reservation, user, calendarSettings, deadlineSettings] =
    await Promise.all([
      getReservationForGuestStatus(access.reservationId),
      getCurrentCustomerUser(),
      getCalendarEmailSettings(),
      getReservationDeadlineSettings(),
    ]);

  if (!reservation) {
    return (
      <StatusHubInvalidLinkView
        mypageHref="/mypage"
        memberResourceLabel="予約"
      />
    );
  }

  const sessionCustomer = user ? await getCustomerByUserId(user.id) : null;
  const ownership = checkGuestStatusMemberOwnership({
    sessionCustomerId: sessionCustomer?.id ?? null,
    resourceCustomerId: reservation.customerId,
  });
  if (ownership.kind === "mismatch") {
    return (
      <GuestStatusMemberOwnershipMismatchView
        message={GUEST_STATUS_RESERVATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE}
        mypageHref="/mypage"
      />
    );
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
  const editHref = buildGuestEditHref({
    status: reservation.status,
    paymentStatus: reservation.paymentStatus,
    discountAmounts: {
      couponDiscountAmount: reservation.couponDiscountAmount,
      durationDiscountAmount: reservation.durationDiscountAmount,
      spaceDiscountAmount: reservation.spaceDiscountAmount,
    },
    startTime: reservation.startTime,
    modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
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
        })
      : null;
  const passcodeRevealState = await getPasscodeRevealState(
    reservation.id,
    { kind: "status-token", reservationId: reservation.id },
    { now },
  );

  return (
    <StatusHubShell>
      <div className="text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          Reservation
        </p>
        <Heading level={1}>予約ステータス</Heading>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          ご予約内容とお支払い状況をご確認いただけます。
        </p>
      </div>

      {reason && (
        <div
          role="alert"
          className="border border-warning/30 bg-warning/5 p-4 text-sm"
        >
          <p className="font-medium text-foreground">
            予約変更ページから戻りました
          </p>
          <p className="mt-1 text-muted-foreground">
            {reason === "status" && "この予約は変更できないステータスです。"}
            {reason === "deadline" && "予約変更の受付期限を過ぎています。"}
            {reason === "discount" && (
              <>
                割引が適用されているため、オンラインでは変更できません。
                <Link
                  href={toAppRoute("/contact")}
                  className="ml-1 underline underline-offset-4 hover:text-foreground"
                >
                  お問い合わせください
                </Link>
                。
              </>
            )}
            {reason === "payment" &&
              "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。"}
          </p>
        </div>
      )}

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
          <ReceiptDownloadSection href={toAppRoute(receiptDownloadHref)} />
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
          {editHref && (
            <li>
              <Link
                href={toAppRoute(editHref)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                予約を変更する
              </Link>
            </li>
          )}
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
    </StatusHubShell>
  );
}
