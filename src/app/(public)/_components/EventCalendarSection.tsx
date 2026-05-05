/**
 * EventCalendarSection — events を list / calendar / toggle で render する section
 *
 * Server Component。`displayLayout` config に応じて 3 variant を dispatch。
 * - list: 一覧のみ
 * - calendar: 自作カレンダーのみ
 * - calendar-list-toggle: タブ切替（EventsViewSwitcher）
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import type { EventCalendarConfig } from "@/shared/lib/sections/definitions/event-calendar/schema";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { EventListView } from "./event-calendar/event-list-view";
import { EventCalendarView } from "./event-calendar/event-calendar-view";
import { EventsViewSwitcher } from "./event-calendar/events-view-switcher";
import type { EventCardData } from "./event-calendar/event-card";

interface EventCalendarSectionProps {
  readonly config: EventCalendarConfig;
  readonly style: SectionStylePayload;
  readonly events: readonly EventCardData[];
}

export function EventCalendarSection({
  config,
  style,
  events,
}: EventCalendarSectionProps): ReactElement {
  const layout = config.displayLayout;

  let body: ReactElement;
  if (layout === "list") {
    body = <EventListView events={events} />;
  } else if (layout === "calendar") {
    body = <EventCalendarView events={events} />;
  } else {
    body = (
      <EventsViewSwitcher
        listView={<EventListView events={events} />}
        calendarView={<EventCalendarView events={events} />}
      />
    );
  }

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mx-auto max-w-5xl">
        {(config.sectionLabel || config.title || config.description) && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <ScrollReveal>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            {config.title && (
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("mt-4 tracking-tight", getTitleClasses(style))}
                >
                  <SplitText>{config.title}</SplitText>
                </Heading>
              </div>
            )}
            {config.description && (
              <ScrollReveal delay={0.2}>
                <p
                  className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground"
                  style={getTextStyle(style)}
                >
                  {config.description}
                </p>
              </ScrollReveal>
            )}
          </div>
        )}
        {body}
      </div>
    </SectionWrapper>
  );
}
