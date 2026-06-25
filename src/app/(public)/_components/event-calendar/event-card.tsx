import Image from "next/image";
import Link from "next/link";
import { IconCalendar, IconMapPin } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { Heading } from "@/public/components/design-system/heading";
import { Badge } from "@/public/components/design-system/badge";
import {
  formatDay,
  formatWeekday,
  formatTime,
  formatEventPrice,
} from "@/public/lib/format-event-date";
import { ImageCarousel } from "@/shared/components/media/ImageCarousel";
import { isImageUrl } from "@/shared/lib/media/detect-media-type";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

export interface EventCardData {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  /** SEO / カード要約用プレーンテキスト（Lexical HTML から派生） */
  readonly descriptionPlainText: string;
  readonly location: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly price: number | null;
  readonly registrationOpen: boolean;
  readonly spaceName: string | null;
  readonly thumbnailUrl: string | null;
  /** ギャラリー画像（複数ある場合はカルーセルで表示） */
  readonly gallery: readonly GalleryItem[];
}

interface EventCardListProps {
  readonly variant: "list";
  readonly event: EventCardData;
  readonly isPast?: boolean;
}

interface EventCardCompactProps {
  readonly variant: "compact";
  readonly event: EventCardData;
  readonly isPast?: boolean;
}

type EventCardProps = EventCardListProps | EventCardCompactProps;

function EventBadges({
  event,
  isPast,
}: {
  readonly event: EventCardData;
  readonly isPast: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isPast ? (
        <Badge variant="default" className="text-muted-foreground">
          終了
        </Badge>
      ) : null}
      {event.price !== null ? (
        <Badge variant={event.price === 0 ? "success" : "default"}>
          {formatEventPrice(event.price)}
        </Badge>
      ) : null}
      {!isPast && !event.registrationOpen ? (
        <Badge variant="warning">受付終了</Badge>
      ) : null}
    </div>
  );
}

function EventMeta({
  event,
  iconSize,
}: {
  readonly event: EventCardData;
  readonly iconSize: string;
}) {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <IconCalendar className={cn(iconSize, "shrink-0")} aria-hidden="true" />
        {formatTime(start)} – {formatTime(end)}
      </span>
      {event.location ? (
        <span className="inline-flex items-center gap-1.5">
          <IconMapPin className={cn(iconSize, "shrink-0")} aria-hidden="true" />
          {event.location}
        </span>
      ) : null}
    </div>
  );
}

export function EventCard({ variant, event, isPast = false }: EventCardProps) {
  if (variant === "compact") {
    return (
      <Link
        href={`/events/${event.slug}`}
        className="group block px-4 py-4 transition-colors hover:bg-surface/50"
      >
        <EventBadges event={event} isPast={isPast} />
        <h3 className="mt-1.5 text-sm font-medium text-foreground">
          {event.title}
        </h3>
        {event.descriptionPlainText ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {event.descriptionPlainText}
          </p>
        ) : null}
        <div className="mt-2">
          <EventMeta event={event} iconSize="h-3 w-3" />
        </div>
      </Link>
    );
  }

  // variant === "list"
  const start = new Date(event.startTime);
  const day = formatDay(start);
  const weekday = formatWeekday(start);

  return (
    <Link
      href={`/events/${event.slug}`}
      className={cn(
        "group grid gap-6 py-6 transition-colors hover:bg-accent/5 md:gap-8 md:py-8",
        event.thumbnailUrl
          ? "grid-cols-[4.5rem_1fr] md:grid-cols-[5.5rem_10rem_1fr]"
          : "grid-cols-[4.5rem_1fr] md:grid-cols-[5.5rem_1fr]",
      )}
    >
      {/* Date block */}
      <div className="flex flex-col items-center pt-1">
        <span className="text-[2rem] font-light leading-none text-foreground md:text-[2.5rem]">
          {day}
        </span>
        <span className="mt-1.5 text-base tracking-eyebrow text-muted-foreground">
          {weekday}
        </span>
      </div>

      {/* Thumbnail — desktop only */}
      {event.thumbnailUrl ? (
        <div className="relative hidden aspect-[3/2] overflow-hidden md:block">
          {event.gallery.length > 0 ? (
            <ImageCarousel
              images={[
                event.thumbnailUrl,
                ...event.gallery.map((g) => g.url).filter(isImageUrl),
              ]}
              alt=""
              sizes="10rem"
              loading="lazy"
            />
          ) : (
            <Image
              src={event.thumbnailUrl}
              alt=""
              fill
              sizes="10rem"
              className="object-cover transition-opacity group-hover:opacity-85"
            />
          )}
        </div>
      ) : null}

      {/* Content */}
      <div className="min-w-0">
        <EventBadges event={event} isPast={isPast} />
        <Heading
          level={3}
          className="mt-2 !text-base transition-colors group-hover:text-foreground md:!text-lg"
        >
          {event.title}
        </Heading>
        {event.descriptionPlainText ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {event.descriptionPlainText}
          </p>
        ) : null}
        <div className="mt-3">
          <EventMeta event={event} iconSize="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}
