"use client";

import { Table, TableBody, TableCell, TableRow } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { EventStatusBadge } from "@/admin/components/status-badges";
import { EventActionCell } from "./EventActionCell";
import { EventTableHeader } from "./EventTableHeader";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { getEvents } from "@/shared/domain/events/admin-queries";

type EventListItem = Awaited<ReturnType<typeof getEvents>>["events"][number];

type EventTableProps = {
  events: EventListItem[];
};

export function EventTable({ events }: EventTableProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        message="イベントがありません"
        action={{ label: "新規作成", href: "/admin/events/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <EventTableHeader />
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap">
                  <EventStatusBadge status={event.status} />
                </TableCell>
                <TableCell>
                  <div>
                    <div className="max-w-xs truncate font-medium">
                      {event.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      /{event.slug}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDateTimeShort(event.startTime)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDateTimeShort(event.endTime)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {event.location ?? "-"}
                </TableCell>
                <TableCell>
                  <EventActionCell eventId={event.id} status={event.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
