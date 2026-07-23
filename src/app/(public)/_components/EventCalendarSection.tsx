/**
 * EventCalendarSection — events を list / calendar / toggle で render する section
 *
 * Server Component。`displayLayout` config に応じて 3 variant を dispatch する。
 * データ取得は `section-renderer.tsx` の EVENT_CALENDAR ケースが `mode` として
 * 事前に構築し渡す(`SpaceListSection` の `mode: SpaceListMode` と同型の precedent)。
 * - list: 一覧のみ(tab/検索/カテゴリー絞り込み + ページネーション)
 * - calendar: 自作カレンダーのみ(フィルタ非適用、無変更)
 * - calendar-list-toggle: タブ切替(EventsViewSwitcher)
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
import {
  EventListView,
  type EventListViewData,
} from "./event-calendar/event-list-view";
import { EventCalendarView } from "./event-calendar/event-calendar-view";
import { EventsViewSwitcher } from "./event-calendar/events-view-switcher";
import type { EventCardData } from "./event-calendar/event-card";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { serverEnv } from "@/shared/lib/env/server";

export type EventCalendarMode =
  | { readonly kind: "calendar"; readonly events: readonly EventCardData[] }
  | { readonly kind: "list"; readonly listData: EventListViewData }
  | {
      readonly kind: "toggle";
      readonly events: readonly EventCardData[];
      readonly listData: EventListViewData;
    };

interface EventCalendarSectionProps {
  readonly config: EventCalendarConfig;
  readonly style: SectionStylePayload;
  readonly mode: EventCalendarMode;
}

export function EventCalendarSection({
  config,
  style,
  mode,
}: EventCalendarSectionProps): ReactElement {
  const initialNowIso =
    serverEnv.E2E_RUNTIME === "1" ? serverEnv.E2E_FIXED_NOW_ISO : undefined;
  const clockProps = initialNowIso !== undefined ? { initialNowIso } : {};

  let body: ReactElement;
  if (mode.kind === "calendar") {
    body = <EventCalendarView events={mode.events} {...clockProps} />;
  } else if (mode.kind === "list") {
    body = <EventListView data={mode.listData} />;
  } else {
    body = (
      <EventsViewSwitcher
        listView={<EventListView data={mode.listData} />}
        calendarView={
          <EventCalendarView events={mode.events} {...clockProps} />
        }
      />
    );
  }

  const hasTitle = config.title.length > 0;
  const hasDescription = config.description.length > 0;
  const showHeader = hasTitle || hasDescription;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mx-auto max-w-5xl">
        {showHeader && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <ScrollReveal>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            {hasTitle && (
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("mt-4 tracking-tight", getTitleClasses(style))}
                >
                  <SplitText>
                    <PortableTextSpans spans={config.title} />
                  </SplitText>
                </Heading>
              </div>
            )}
            {hasDescription && (
              <ScrollReveal delay={0.2}>
                <div
                  className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground [&_p]:mt-0 [&_p+p]:mt-3"
                  style={getTextStyle(style)}
                >
                  <PortableText blocks={config.description} />
                </div>
              </ScrollReveal>
            )}
          </div>
        )}
        {body}
      </div>
    </SectionWrapper>
  );
}
