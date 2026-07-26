import type { ReactElement } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { EventRegistrationForm } from "./event-registration-form";
import { EventStatusNotice } from "./event-status-notice";
import {
  loadEventRegistrationContext,
  type PublishedEventDetail,
} from "./event-registration-context";

interface EventRegistrationSectionProps {
  readonly event: PublishedEventDetail;
  readonly slug: string;
}

export async function EventRegistrationSection({
  event,
  slug,
}: EventRegistrationSectionProps): Promise<ReactElement> {
  const context = await loadEventRegistrationContext(event);
  const canRegister =
    context.registration.kind === "open" ||
    context.registration.kind === "waitlist-available";

  return (
    <section
      id="event-register"
      aria-labelledby="event-register-heading"
      className="mt-16 scroll-mt-[calc(var(--header-height)+2rem)]"
    >
      <Heading level={2} accent>
        <span id="event-register-heading">お申し込み</span>
      </Heading>
      <div className="mt-8 space-y-6">
        {context.registration.kind === "waitlist-available" ? (
          <EventStatusNotice
            variant="warning"
            title="現在満員です"
            description="キャンセル待ちにご登録いただけます。繰り上げ当選のご連絡から24時間以内にご確定ください。"
          />
        ) : null}
        {canRegister ? (
          <EventRegistrationForm
            key={event.id}
            eventId={event.id}
            turnstileSiteKey={context.turnstileSiteKey}
            scheduleMode={event.scheduleMode}
            slots={context.slotOptions}
            tickets={event.tickets.map((ticket) => ({
              id: ticket.id,
              name: ticket.name,
              price: ticket.price,
              unitSize: ticket.unitSize,
              capacity: ticket.capacity,
            }))}
            ticketSlotCounts={context.ticketSlotCounts}
            requiredTerms={context.requiredTerms}
            isLoggedIn={context.isLoggedIn}
            slug={slug}
            mode={
              context.registration.kind === "waitlist-available"
                ? "waitlist"
                : "register"
            }
          />
        ) : context.registration.kind === "deadline-passed" ? (
          <EventStatusNotice
            variant="muted"
            title="申込受付を終了しました"
            description="申込締切を過ぎたため、現在お申し込みいただけません。"
          />
        ) : (
          <EventStatusNotice
            variant="muted"
            title="申込受付を終了しました"
            description="このイベントの申込受付は終了しました。"
          />
        )}
      </div>
    </section>
  );
}

export function EventRegistrationSectionFallback(): ReactElement {
  return (
    <section
      id="event-register"
      aria-labelledby="event-register-heading"
      className="mt-16 scroll-mt-[calc(var(--header-height)+2rem)]"
    >
      <Heading level={2} accent>
        <span id="event-register-heading">お申し込み</span>
      </Heading>
      <div className="mt-8 space-y-6">
        <EventStatusNotice
          variant="muted"
          title="申込情報を読み込み中"
          description="最新の空き状況を確認しています。"
        />
      </div>
    </section>
  );
}
