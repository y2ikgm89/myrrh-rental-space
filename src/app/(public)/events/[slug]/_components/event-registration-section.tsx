import type { ReactElement, ReactNode } from "react";
import { Heading } from "@/public/components/design-system/heading";
import { EventRegistrationForm } from "./event-registration-form";
import { EventStatusNotice } from "./event-status-notice";
import {
  loadEventRegistrationContext,
  type PublishedEventDetail,
} from "./event-registration-context";

/** 申込セクションへのアンカー ID の SSoT（info panel の「申し込む」リンク先）。 */
export const REGISTER_ANCHOR_ID = "event-register";

const REGISTER_HEADING_ID = "event-register-heading";

interface EventRegistrationSectionShellProps {
  readonly children: ReactNode;
}

/**
 * 申込セクションの安定した外殻（`<section>` + 見出し）。
 *
 * **Suspense の外側**に置くこと。以前は解決後の本体と fallback が各々この外殻を
 * 持っていたため、ストリーミング中に `id="event-register"` と
 * `id="event-register-heading"` が DOM に 2 つ現れていた（重複 ID は
 * WCAG 4.1.1 / axe `duplicate-id-aria` 違反で、アンカーリンクの飛び先も不定になる）。
 * 動的に差し替わるのは中身だけなので、外殻は 1 つに固定する。
 */
export function EventRegistrationSectionShell({
  children,
}: EventRegistrationSectionShellProps): ReactElement {
  return (
    <section
      id={REGISTER_ANCHOR_ID}
      aria-labelledby={REGISTER_HEADING_ID}
      className="mt-16 scroll-mt-[calc(var(--header-height)+2rem)]"
    >
      <Heading level={2} accent>
        <span id={REGISTER_HEADING_ID}>お申し込み</span>
      </Heading>
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}

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
    <>
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
    </>
  );
}

/** Suspense fallback。外殻は `EventRegistrationSectionShell` が持つので中身だけを返す。 */
export function EventRegistrationSectionFallback(): ReactElement {
  return (
    <EventStatusNotice
      variant="muted"
      title="申込情報を読み込み中"
      description="最新の空き状況を確認しています。"
    />
  );
}
