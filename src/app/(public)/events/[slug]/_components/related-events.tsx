import { connection } from "next/server";
import type { ReactElement } from "react";

import { Container } from "@/public/components/design-system/container";
import { Section } from "@/public/components/design-system/section";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { getUpcomingEventsExcluding } from "@/shared/domain/events/public-queries";
import { formatEventVenue } from "@/shared/domain/events/venue";
import {
  EventCard,
  type EventCardData,
} from "../../../_components/event-calendar/event-card";

interface RelatedEventsProps {
  readonly excludeEventId: string;
  readonly spaceId: string | null;
  /** 最大表示件数。デフォルト 4。 */
  readonly limit?: number;
}

/**
 * 関連イベントセクション（公開詳細ページ末尾・SiteCTA 前）
 *
 * 同スペース優先で「今後のイベント」を取得して表示する。
 * 該当なしの場合は null を返してセクション全体を非表示にする。
 */
export async function RelatedEvents({
  excludeEventId,
  spaceId,
  limit = 4,
}: RelatedEventsProps): Promise<ReactElement | null> {
  await connection();

  const picked = await getUpcomingEventsExcluding({
    excludeEventId,
    spaceId,
    limit,
  });

  if (picked.length === 0) return null;

  const cards: readonly EventCardData[] = picked.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    descriptionPlainText: e.descriptionPlainText,
    location: formatEventVenue({
      location: e.location,
      space: e.space,
      addressDetail: e.addressDetail,
    }),
    startTime: e.startTime,
    endTime: e.endTime,
    slots: e.slots.map((slot) => ({
      id: slot.id,
      startTime: slot.startAt,
      endTime: slot.endAt,
      capacity: slot.capacity,
    })),
    price: e.tickets[0]?.price ?? null,
    registrationOpen: e.registrationOpen,
    spaceName: e.space?.name ?? null,
    thumbnailUrl: e.thumbnailUrl ?? null,
    gallery: e.gallery,
  }));

  return (
    <Section border="top">
      <Container variant="narrow">
        <Stack gap="lg">
          <Heading level={2}>他のイベント</Heading>
          <div className="divide-y divide-divider">
            {cards.map((event) => (
              <EventCard key={event.id} variant="list" event={event} />
            ))}
          </div>
        </Stack>
      </Container>
    </Section>
  );
}
