"use client";

import Link from "next/link";
import { IconCalendar, IconMapPin, IconClock } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/public/components/design-system/dialog";

interface EventModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly event: {
    readonly title: string;
    readonly slug: string;
    readonly description: string | null;
    readonly location: string | null;
    readonly startTime: string;
    readonly endTime: string;
  } | null;
}

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const datePart = dateFormatter.format(start);
  const startTimePart = timeFormatter.format(start);
  const endTimePart = timeFormatter.format(end);
  return `${datePart} ${startTimePart} - ${endTimePart}`;
}

export function EventModal({ open, onOpenChange, event }: EventModalProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription className="sr-only">
            イベント詳細情報
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 text-muted-foreground">
            <IconCalendar
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{formatDateTimeRange(event.startTime, event.endTime)}</span>
          </div>

          {event.location ? (
            <div className="flex items-start gap-2 text-muted-foreground">
              <IconMapPin
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{event.location}</span>
            </div>
          ) : null}

          {event.description ? (
            <div className="flex items-start gap-2 text-muted-foreground">
              <IconClock
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p className="whitespace-pre-wrap">{event.description}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            詳細を見る
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
