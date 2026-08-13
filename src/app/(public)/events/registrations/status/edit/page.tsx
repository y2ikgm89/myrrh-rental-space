/**
 * /events/registrations/status/edit — ゲストイベント申込変更ページ
 *
 * status token 認可。会員 mypage edit と同ゲート。
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getEventRegistrationForGuestEdit } from "@/shared/domain/events/registration-queries";
import { resolveOptionalCustomerSession } from "@/shared/lib/customer-auth/gates";
import {
  checkGuestStatusMemberOwnership,
  GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE,
} from "@/shared/lib/guest-status-member-ownership";
import { resolveGuestEventRegistrationStatusAccess } from "@/shared/domain/events/guest-status-view";
import { isEventRegistrationEditableForCustomerSelfServe } from "@/shared/domain/events/edit-eligibility";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { Heading } from "@/public/components/design-system/heading";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Stack } from "@/public/components/design-system/stack";
import { EditEventRegistrationForm } from "@/public/components/edit-event-registration-form";
import { GuestStatusMemberOwnershipMismatchView } from "@/public/components/guest-status-member-ownership-mismatch-view";
import { StatusHubInvalidLinkView } from "@/public/components/status-hub/status-hub-invalid-link-view";
import { StatusHubTooManyRequestsView } from "@/public/components/status-hub/status-hub-too-many-requests-view";
import { updateGuestEventRegistrationAction } from "./_actions/update";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import Link from "next/link";
import { toAppRoute } from "@/shared/lib/typed-routes";

export default async function GuestEventRegistrationEditPage(): Promise<ReactElement> {
  await connection();
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
    return <StatusHubTooManyRequestsView />;
  }

  if (access.kind === "invalid") {
    return (
      <StatusHubInvalidLinkView
        mypageHref="/mypage/events"
        memberResourceLabel="申込"
      />
    );
  }

  const [registration, user, turnstileSiteKey] = await Promise.all([
    getEventRegistrationForGuestEdit(access.registrationId),
    resolveOptionalCustomerSession(),
    getTurnstileSiteKey(),
  ]);

  if (!registration) {
    return (
      <StatusHubInvalidLinkView
        mypageHref="/mypage/events"
        memberResourceLabel="申込"
      />
    );
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

  const eligibility = isEventRegistrationEditableForCustomerSelfServe({
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    slotStartAt: registration.slot.startAt,
    now,
  });

  if (!eligibility.ok) {
    redirect(`/events/registrations/status?reason=${eligibility.reason}`);
  }

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>申込内容の変更</Heading>
        <EditEventRegistrationForm
          key={registration.id}
          registrationId={registration.id}
          eventTitle={registration.event.title}
          ticketName={registration.ticket.name}
          ticketUnitPrice={registration.ticket.price}
          ticketUnitSize={registration.ticket.unitSize}
          slotStartAt={registration.slot.startAt.toISOString()}
          slotEndAt={registration.slot.endAt.toISOString()}
          quantityEditable={eligibility.quantityEditable}
          initialValues={{
            name: registration.name,
            email: registration.email ?? "",
            phone: registration.phone ?? "",
            note: registration.note ?? "",
            quantity: registration.quantity,
          }}
          turnstileSiteKey={turnstileSiteKey}
          action={updateGuestEventRegistrationAction}
          cancelHref="/events/registrations/status"
          successHref="/events/registrations/status"
          turnstileAction={TURNSTILE_ACTIONS.guest_event_registration_edit}
        />
        <p className="text-sm text-muted-foreground">
          会員の方は
          <Link
            href={toAppRoute("/mypage/events")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            マイページ
          </Link>
          からも申込を確認できます。
        </p>
      </Stack>
    </PageLayout>
  );
}
