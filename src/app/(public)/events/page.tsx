/**
 * /events — イベント一覧 (Editorial Magazine)
 *
 * 一覧ビュー + カレンダービューの切替。FullCalendar 不使用。
 * DB セクションシステム統合（hero + trailing sections）。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { getPublishedEvents } from "@/shared/domain/events/public-queries";
import { Container } from "@/public/components/design-system/container";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { eventsSearchParams } from "@/public/lib/search-params";
import { EventsViewSwitcher } from "./_components/events-view-switcher";
import { EventListView } from "./_components/event-list-view";
import { EventCalendarView } from "./_components/event-calendar-view";
import type { EventCardData } from "./_components/event-card";

interface EventsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
}

export default async function EventsPage({
  searchParams,
}: EventsPageProps): Promise<ReactElement> {
  await connection();

  const { view } = await eventsSearchParams.parse(searchParams);

  const [sections, rawEvents] = await Promise.all([
    getPageSectionsWithFallback("events"),
    getPublishedEvents(),
  ]);

  const events: EventCardData[] = rawEvents.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    descriptionPlainText: e.descriptionPlainText,
    location: e.location,
    startTime: e.startTime,
    endTime: e.endTime,
    price: e.price,
    registrationOpen: e.registrationOpen,
    spaceName: e.space?.name ?? null,
    thumbnailUrl: e.thumbnailUrl ?? null,
  }));

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "event-calendar",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={<SiteCTA />}
    >
      <section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container>
          <EventsViewSwitcher
            activeView={view}
            listView={<EventListView events={events} />}
            calendarView={<EventCalendarView events={events} />}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
