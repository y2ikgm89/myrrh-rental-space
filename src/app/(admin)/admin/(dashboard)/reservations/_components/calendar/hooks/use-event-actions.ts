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

  /**
   * Dialog に渡す選択中イベント (derived state)。
   * SSoT は `selectedEventId` のみ。`optimisticEvents` から id 引きする派生値で、
   * フィルタ変更や楽観的削除で対象が消えると null に解決される。
   */
  const selectedEvent =
    selectedEventId !== null
      ? (optimisticEvents.find((e) => e.id === selectedEventId) ?? null)
      : null;

  // React 19 公式パターン: 「render 中の state 調整」で stale id を同期する。
  // 例: スペース/ステータスフィルタを変更すると optimisticEvents から選択中予約が
  // 消える → Dialog は event=null で自然に close するが、id が残ったままだと次に
  // 同じ予約を含むフィルタに戻したとき Dialog がゴースト再オープンしてしまう。
  // useEffect + setState は @eslint-react/set-state-in-effect で禁止されているため、
  // render 中に同じ条件で setState すれば React 19 が新しい state で再 render する
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)。
  if (
    selectedEventId !== null &&
    !optimisticEvents.some((e) => e.id === selectedEventId)
  ) {
    setSelectedEventId(null);
  }

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
