/**
 * /mypage/events/[id]/edit — イベント申込変更ページ
 */

import type { ReactElement } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { getEventRegistrationForCustomerEdit } from "@/shared/domain/events/registration-queries";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { isEventRegistrationEditableForCustomerSelfServe } from "@/shared/domain/events/edit-eligibility";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { Heading } from "@/public/components/design-system/heading";
import { EditEventRegistrationForm } from "@/public/components/edit-event-registration-form";
import { updateCustomerEventRegistrationAction } from "../../../_shared/actions/event-registration";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function MypageEventRegistrationEditPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  const { id } = await params;
  const { user } = await requireMypageSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [registration, turnstileSiteKey] = await Promise.all([
    getEventRegistrationForCustomerEdit(id, customer.id),
    getTurnstileSiteKey(),
  ]);

  if (!registration) {
    notFound();
  }

  const now = eventDeadlineNow();
  const eligibility = isEventRegistrationEditableForCustomerSelfServe({
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    slotStartAt: registration.slot.startAt,
    now,
  });

  if (!eligibility.ok) {
    redirect(`/mypage/events/${id}?reason=${eligibility.reason}`);
  }

  if (!registration.email) {
    redirect(`/mypage/events/${id}?reason=payment`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Heading level={1}>申込内容の変更</Heading>
      <div className="mt-6">
        <EditEventRegistrationForm
          key={registration.id}
          registrationId={registration.id}
          eventTitle={registration.event.title}
          ticketName={registration.ticket.name}
          ticketUnitPrice={registration.ticket.price}
          slotStartAt={registration.slot.startAt.toISOString()}
          slotEndAt={registration.slot.endAt.toISOString()}
          quantityEditable={eligibility.quantityEditable}
          initialValues={{
            name: registration.name,
            email: registration.email,
            phone: registration.phone ?? "",
            note: registration.note ?? "",
            quantity: registration.quantity,
          }}
          turnstileSiteKey={turnstileSiteKey}
          action={updateCustomerEventRegistrationAction}
          cancelHref={`/mypage/events/${registration.id}`}
          successHref={`/mypage/events/${registration.id}`}
          turnstileAction={TURNSTILE_ACTIONS.mypage_event_registration_edit}
        />
      </div>
    </div>
  );
}
