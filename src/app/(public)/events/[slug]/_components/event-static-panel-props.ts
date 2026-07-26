import type { ComponentProps } from "react";
import {
  buildCurrentPublicEventSlotOptions,
  type PublicEventRegistrationState,
} from "@/shared/domain/events/public-slot-options";
import {
  formatEventVenueDisplay,
  isEventVirtualAccessible,
} from "@/shared/domain/events/venue";
import { EVENT_FORMAT } from "@/shared/lib/validations/enums/prisma-types";
import { EventInfoPanel, type EventInfoPanelVenue } from "./event-info-panel";
import type { PublishedEventDetail } from "./event-registration-context";

type EventInfoPanelProps = ComponentProps<typeof EventInfoPanel>;

function buildEventVenues(event: PublishedEventDetail): EventInfoPanelVenue[] {
  const venues: EventInfoPanelVenue[] = [];
  if (event.format !== EVENT_FORMAT.ONLINE) {
    if (event.space) {
      venues.push({
        kind: "space",
        slug: event.space.slug,
        name: event.space.name,
      });
    }
    if (event.location) {
      venues.push({
        kind: "location",
        name: event.location.name,
        address: event.location.address ?? null,
      });
    }
    if (event.addressDetail) {
      venues.push({ kind: "addressDetail", text: event.addressDetail });
    }
  }
  return venues;
}

function buildStaticSlotOptions(event: PublishedEventDetail) {
  return buildCurrentPublicEventSlotOptions({
    slots: event.slots.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      capacity: slot.capacity,
      confirmedCount: 0,
    })),
    registrationDeadline: event.registrationDeadline,
  });
}

const staticRegistrationState: PublicEventRegistrationState = {
  kind: "closed",
};

export function buildStaticEventInfoPanelProps(
  event: PublishedEventDetail,
  registerAnchorId: string,
): Omit<EventInfoPanelProps, "variant"> {
  return {
    startTime: event.startTime,
    endTime: event.endTime,
    venues: buildEventVenues(event),
    venueDisplay: formatEventVenueDisplay(event),
    virtualAccessible: isEventVirtualAccessible(event),
    scheduleMode: event.scheduleMode,
    slots: buildStaticSlotOptions(event),
    tickets: event.tickets,
    registration: staticRegistrationState,
    registerAnchorId,
    showInventory: false,
  };
}

export function buildDynamicEventInfoPanelProps(
  event: PublishedEventDetail,
  registerAnchorId: string,
  context: {
    readonly slotOptions: EventInfoPanelProps["slots"];
    readonly registration: EventInfoPanelProps["registration"];
  },
): Omit<EventInfoPanelProps, "variant"> {
  return {
    startTime: event.startTime,
    endTime: event.endTime,
    venues: buildEventVenues(event),
    venueDisplay: formatEventVenueDisplay(event),
    virtualAccessible: isEventVirtualAccessible(event),
    scheduleMode: event.scheduleMode,
    slots: context.slotOptions,
    tickets: event.tickets,
    registration: context.registration,
    registerAnchorId,
    showInventory: true,
  };
}
