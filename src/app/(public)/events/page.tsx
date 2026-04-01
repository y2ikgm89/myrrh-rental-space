import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { CalendarSkeleton } from "@/public/components/event-calendar/CalendarSkeleton";
import { EventCalendar } from "@/public/components/event-calendar/EventCalendar";
import { getPublishedEvents } from "@/shared/domain/events/public-queries";

export const metadata: Metadata = {
  title: "イベントカレンダー",
  description: "開催予定のイベント・ワークショップ情報",
};

async function EventCalendarLoader() {
  await connection();

  const events = await getPublishedEvents();
  return <EventCalendar events={events} />;
}

export default function EventsPage() {
  return (
    <main id="main-content">
      <Container>
        <Stack gap="lg">
          <Heading level={1}>イベントカレンダー</Heading>
          <Suspense fallback={<CalendarSkeleton />}>
            <EventCalendarLoader />
          </Suspense>
        </Stack>
      </Container>
    </main>
  );
}
