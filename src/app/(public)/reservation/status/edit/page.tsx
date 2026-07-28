/**
 * /reservation/status/edit — ゲスト予約変更ページ
 *
 * status token 認可。会員 mypage edit と同ゲート。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getReservationForGuestEdit } from "@/shared/domain/reservations/customer-queries";
import { resolveOptionalCustomerSession } from "@/shared/lib/customer-auth/gates";
import {
  checkGuestStatusMemberOwnership,
  GUEST_STATUS_RESERVATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE,
} from "@/shared/lib/guest-status-member-ownership";
import { resolveGuestStatusAccess } from "@/shared/domain/reservations/guest-status-view";
import { isReservationEditableForCustomerSelfServe } from "@/shared/domain/reservations/edit-eligibility";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getActiveSpacesByLocationId } from "@/shared/domain/spaces/public-queries";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { Heading } from "@/public/components/design-system/heading";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Stack } from "@/public/components/design-system/stack";
import { EditReservationForm } from "@/public/components/edit-reservation-form";
import { GuestStatusMemberOwnershipMismatchView } from "@/public/components/guest-status-member-ownership-mismatch-view";
import { updateGuestReservationAction } from "./_actions/update";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import Link from "next/link";
import { formatJstDateString, formatTimeShort } from "@/shared/lib/date-format";
import { toAppRoute } from "@/shared/lib/typed-routes";

export default async function GuestReservationEditPage(): Promise<ReactElement> {
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

  const [reservation, user, deadlineSettings] = await Promise.all([
    getReservationForGuestEdit(access.reservationId),
    resolveOptionalCustomerSession(),
    getReservationDeadlineSettings(),
  ]);

  if (!reservation) {
    return <InvalidLinkView />;
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
  const eligibility = isReservationEditableForCustomerSelfServe({
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

  if (!eligibility.ok) {
    redirect(`/reservation/status?reason=${eligibility.reason}`);
  }

  const [spaces, turnstileSiteKey] = await Promise.all([
    getActiveSpacesByLocationId(reservation.space.locationId),
    getTurnstileSiteKey(),
  ]);

  const dateStr = formatJstDateString(reservation.startTime);
  const startTimeStr = formatTimeShort(reservation.startTime);
  const endTimeStr = formatTimeShort(reservation.endTime);

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>予約内容の変更</Heading>
        <EditReservationForm
          key={reservation.id}
          reservationId={reservation.id}
          numberOfGuests={1}
          spaces={spaces}
          version={reservation.version}
          initialValues={{
            spaceId: reservation.spaceId,
            date: dateStr,
            startTime: startTimeStr,
            endTime: endTimeStr,
          }}
          turnstileSiteKey={turnstileSiteKey}
          action={updateGuestReservationAction}
          cancelHref="/reservation/status"
          successHref="/reservation/status"
          turnstileAction={TURNSTILE_ACTIONS.guest_reservation_edit}
        />
      </Stack>
    </PageLayout>
  );
}

function InvalidLinkView(): ReactElement {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-base font-medium text-foreground">
            リンクが無効または期限切れです
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            会員の方は
            <Link
              href={toAppRoute("/mypage")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              マイページ
            </Link>
            から予約を確認できます。
          </p>
        </div>
      </Stack>
    </PageLayout>
  );
}

function TooManyRequestsView(): ReactElement {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-base font-medium text-foreground">
            リクエストが多すぎます
          </p>
        </div>
      </Stack>
    </PageLayout>
  );
}
