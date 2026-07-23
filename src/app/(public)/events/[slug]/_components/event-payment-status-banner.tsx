import type { ReactElement } from "react";
import { connection } from "next/server";
import {
  getEventRegistrationPaymentBannerContext,
  resolveEventPaymentBannerMessage,
} from "@/shared/domain/events/payment-banner";
import { EventStatusNotice } from "./event-status-notice";

interface EventPaymentStatusBannerProps {
  readonly slug: string;
  readonly payment: string | undefined;
  readonly registrationId: string | undefined;
}

export async function EventPaymentStatusBanner({
  slug,
  payment,
  registrationId,
}: EventPaymentStatusBannerProps): Promise<ReactElement | null> {
  if (!payment || !registrationId) return null;

  await connection();

  const registration = await getEventRegistrationPaymentBannerContext({
    registrationId,
    eventSlug: slug,
  });
  const message = resolveEventPaymentBannerMessage({ payment, registration });
  if (!message) return null;

  return (
    <EventStatusNotice
      variant={message.variant}
      title={message.title}
      description={message.description}
    />
  );
}
