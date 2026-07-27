"use client";

import { useState } from "react";
import { Badge, Table, TableBody, TableCell } from "@/admin/components/ui";
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
import { formatEventVenue } from "@/shared/lib/events/venue";
import { getEventScheduleModeLabel } from "@/shared/domain/events/schedule-mode";

type EventListItem = Awaited<ReturnType<typeof getEvents>>["events"][number];

type EventTableProps = {
  events: EventListItem[];
  /** feature OFF 時は EmptyState の新規作成を出さない */
  allowCreate?: boolean;
};

export function EventTable({ events, allowCreate = true }: EventTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = events.map((e) => e.id);

  // Round-5 audit Finding #9: 検索・並び替え・ページ移動で events が入れ替わっても
  // selectedIds はローカル state に残るため、次の一括操作で見えていない過去選択の
  // イベントまで対象になる。CouponTable.tsx と同型の修正。
  const visibleIdSet = new Set(allIds);
  const effectiveSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));

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
        {...(allowCreate
          ? { action: { label: "新規作成", href: "/admin/events/new" } }
          : {})}
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
                      <div className="flex max-w-xs items-center gap-2">
                        <span className="truncate font-medium">
                          {event.title}
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {getEventScheduleModeLabel(event.scheduleMode)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        /{event.slug}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(
                      event.firstSlotStartAt ?? event.slots[0]?.startAt ?? null,
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(
                      event.lastSlotEndAt ?? event.slots[0]?.endAt ?? null,
                    )}
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
                  <TableCell className="text-right" onClick={stopRowClick}>
                    <EventActionCell eventId={event.id} />
                  </TableCell>
                </ClickableTableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <EventBulkActions
        selectedIds={effectiveSelectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
