"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateReservationStatus } from "@/admin/actions/reservation";
import type { CalendarEvent } from "@/admin/lib/calendar";
import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isMutationError } from "@/shared/lib/mutation-result";

type OptimisticAction = {
  type: "UPDATE_STATUS";
  eventId: string;
  newStatus: ReservationStatus;
};

function eventsReducer(
  events: CalendarEvent[],
  action: OptimisticAction,
): CalendarEvent[] {
  switch (action.type) {
    case "UPDATE_STATUS":
      return events.map((event) =>
        event.id === action.eventId
          ? { ...event, status: action.newStatus }
          : event,
      );
    default:
      return events;
  }
}

interface UseEventActionsOptions {
  events: CalendarEvent[];
}

export function useEventActions({ events }: UseEventActionsOptions) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticEvents, setOptimisticEvents] = useOptimistic(
    events,
    eventsReducer,
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent =
    selectedEventId !== null
      ? (optimisticEvents.find((e) => e.id === selectedEventId) ?? null)
      : null;

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEventId(event.id);
  };

  const handleCloseDialog = () => {
    setSelectedEventId(null);
  };

  const handleStatusChange = async (
    eventId: string,
    newStatus: ReservationStatus,
  ) => {
    if (isPending) return;

    startTransition(async () => {
      setOptimisticEvents({
        type: "UPDATE_STATUS",
        eventId,
        newStatus,
      });

      const result = await updateReservationStatus(eventId, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success("ステータスを更新しました");
      router.refresh();
      setSelectedEventId(null);
    });
  };

  return {
    isPending,
    optimisticEvents,
    selectedEvent,
    handleEventClick,
    handleCloseDialog,
    handleStatusChange,
  };
}
