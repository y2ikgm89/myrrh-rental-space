import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import type { getPublishedEventBySlug } from "@/shared/domain/events/public-queries";
import { getEventPublicRegistrationInventory } from "@/shared/domain/events/slot-queries";
import {
  buildCurrentPublicEventSlotOptions,
  derivePublicEventRegistrationState,
  type PublicEventRegistrationState,
  type PublicEventSlotOption,
  type PublicEventTicketSlotCount,
} from "@/shared/domain/events/public-slot-options";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { resolveOptionalCustomerSession } from "@/shared/lib/customer-auth/gates";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

export type PublishedEventDetail = NonNullable<
  Awaited<ReturnType<typeof getPublishedEventBySlug>>
>;

export type EventRegistrationContext = {
  readonly slotOptions: readonly PublicEventSlotOption[];
  readonly registration: PublicEventRegistrationState;
  readonly ticketSlotCounts: readonly PublicEventTicketSlotCount[];
  readonly turnstileSiteKey: string | null;
  readonly requiredTerms: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  }>;
  readonly isLoggedIn: boolean;
};

export const loadEventRegistrationContext = cache(
  async (event: PublishedEventDetail): Promise<EventRegistrationContext> => {
    await connection();

    const ticketInventories = event.tickets.map((ticket) => ({
      id: ticket.id,
      capacity: ticket.capacity,
    }));

    const [registrationInventory, turnstileSiteKey, requiredTerms, user] =
      await Promise.all([
        getEventPublicRegistrationInventory(event.id),
        getTurnstileSiteKey(),
        getRequiredTermsByScope(TermsScope.EVENT_REGISTRATION),
        resolveOptionalCustomerSession(),
      ]);

    const slotOptions = buildCurrentPublicEventSlotOptions({
      slots: registrationInventory.slots,
      registrationDeadline: event.registrationDeadline,
    });
    const registration = derivePublicEventRegistrationState({
      eventStatus: event.status,
      registrationOpen: event.registrationOpen,
      slots: slotOptions,
      tickets: ticketInventories,
      ticketSlotCounts: registrationInventory.ticketSlotCounts,
    });

    return {
      slotOptions,
      registration,
      ticketSlotCounts: registrationInventory.ticketSlotCounts,
      turnstileSiteKey,
      requiredTerms: requiredTerms.map((term) => ({
        id: term.id,
        slug: term.slug,
        title: term.title,
      })),
      isLoggedIn: user != null,
    };
  },
);
