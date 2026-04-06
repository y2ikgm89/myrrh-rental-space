import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Container } from "@/public/components/design-system/container";
import { Section } from "@/public/components/design-system/section";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { PageHero } from "@/public/components/layouts/page-hero";
import { SiteCTA } from "@/public/components/layouts/site-cta";
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
    <PageLayout
      variant="content"
      hero={<PageHero variant="compact" title="イベントカレンダー" />}
      cta={<SiteCTA />}
    >
      <Section>
        <Container>
          <Suspense fallback={<CalendarSkeleton />}>
            <EventCalendarLoader />
          </Suspense>
        </Container>
      </Section>
    </PageLayout>
  );
}
