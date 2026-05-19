"use client";

import { useState } from "react";
import { Table, TableBody, TableCell } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { EventActionCell } from "./EventActionCell";
import { EventStatusSelect } from "./EventStatusSelect";
import { EventTableHeader } from "./EventTableHeader";
import { EventBulkActions } from "./EventBulkActions";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { getEvents } from "@/shared/domain/events/admin-queries";
import { formatEventVenue } from "@/shared/domain/events/venue";

type EventListItem = Awaited<ReturnType<typeof getEvents>>["events"][number];

type EventTableProps = {
  events: EventListItem[];
};

export function EventTable({ events }: EventTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = events.map((e) => e.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  if (events.length === 0) {
    return (
      <EmptyState
        message="イベントがありません"
        action={{ label: "新規作成", href: "/admin/events/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <EventTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {events.map((event) => (
                <ClickableTableRow
                  key={event.id}
                  href={`/admin/events/${event.id}`}
                  aria-label={`${event.title} のイベントを編集`}
                >
                  <TableCell onClick={stopRowClick}>
                    <CheckboxCell
                      checked={selectedIds.includes(event.id)}
                      onChange={() => toggleOne(event.id)}
                      aria-label={`${event.title} を選択`}
                    />
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
                    {formatEventVenue({
                      location: event.location,
                      space: event.space,
                      addressDetail: event.addressDetail,
                    }) ?? "-"}
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap"
                    onClick={stopRowClick}
                  >
                    <EventStatusSelect
                      eventId={event.id}
                      currentStatus={event.status}
                    />
                  </TableCell>
                  <TableCell onClick={stopRowClick}>
                    <EventActionCell eventId={event.id} />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <EventBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
