"use client";

import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import jaLocale from "@fullcalendar/core/locales/ja";
import type { EventClickArg } from "@fullcalendar/core";
import type { getPublishedEvents } from "@/shared/domain/events/public-queries";
import { EventModal } from "./EventModal";

type PublishedEvent = Awaited<ReturnType<typeof getPublishedEvents>>[number];

interface SelectedEvent {
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startTime: string;
  readonly endTime: string;
}

interface EventCalendarProps {
  readonly events: readonly PublishedEvent[];
}

function toCalendarEvents(events: readonly PublishedEvent[]) {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.startTime,
    end: event.endTime,
    extendedProps: {
      slug: event.slug,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
    },
  }));
}

export function EventCalendar({ events }: EventCalendarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(
    null,
  );

  const handleEventClick = (info: EventClickArg) => {
    const { extendedProps } = info.event;
    const slug =
      typeof extendedProps["slug"] === "string" ? extendedProps["slug"] : "";
    const description =
      typeof extendedProps["description"] === "string"
        ? extendedProps["description"]
        : null;
    const location =
      typeof extendedProps["location"] === "string"
        ? extendedProps["location"]
        : null;
    const startTime =
      typeof extendedProps["startTime"] === "string"
        ? extendedProps["startTime"]
        : "";
    const endTime =
      typeof extendedProps["endTime"] === "string"
        ? extendedProps["endTime"]
        : "";

    setSelectedEvent({
      title: info.event.title,
      slug,
      description,
      location,
      startTime,
      endTime,
    });
    setModalOpen(true);
  };

  return (
    <>
      <div className="event-calendar-wrapper">
        <FullCalendar
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          locale={jaLocale}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
          }}
          buttonText={{
            today: "今日",
            month: "月",
            week: "週",
            list: "リスト",
          }}
          events={toCalendarEvents(events)}
          eventClick={handleEventClick}
          height="auto"
          dayMaxEvents={3}
          eventDisplay="block"
        />
      </div>

      <EventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        event={selectedEvent}
      />
    </>
  );
}
