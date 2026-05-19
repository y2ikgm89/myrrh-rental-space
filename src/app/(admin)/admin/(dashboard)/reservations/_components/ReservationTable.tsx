"use client";

/**
 * 予約一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル（一括操作対応）
 */

import { useState } from "react";
import { Table, TableBody, TableCell } from "@/admin/components/ui";
import { ReservationTableHeader } from "./ReservationTableHeader";
import { PaymentStatusBadge } from "@/admin/components/status-badges";
import { ReservationStatusSelect } from "./ReservationStatusSelect";
import { ReservationActionCell } from "./ReservationActionCell";
import { ReservationBulkActions } from "./ReservationBulkActions";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { formatPrice } from "@/shared/lib/pricing/format";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  CheckboxCell,
  ClickableTableRow,
  stopRowClick,
} from "@/admin/components/table";
import { TERMINAL_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Types
// =============================================================================

type ReservationTableProps = {
  reservations: ReservationWithRelations[];
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(date));
}

function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function isSelectable(reservation: ReservationWithRelations): boolean {
  if (reservation.deletedAt) return false;
  return !TERMINAL_RESERVATION_STATUSES.includes(reservation.status);
}

// =============================================================================
// ReservationTable Component (Client Component)
// =============================================================================

export function ReservationTable({ reservations }: ReservationTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectableIds = reservations.filter(isSelectable).map((r) => r.id);
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableIds);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  if (reservations.length === 0) {
    return (
      <EmptyState
        message="予約がありません"
        action={{ label: "新規予約", href: "/admin/reservations/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <ReservationTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {reservations.map((reservation) => {
                const selectable = isSelectable(reservation);
                return (
                  <ClickableTableRow
                    key={reservation.id}
                    href={`/admin/reservations/${reservation.id}`}
                    aria-label={`${formatDate(reservation.startTime)} ${reservation.space.name} の予約を表示`}
                    {...(reservation.deletedAt
                      ? { className: "opacity-50" }
                      : {})}
                  >
                    <TableCell onClick={stopRowClick}>
                      <CheckboxCell
                        checked={selectedIds.includes(reservation.id)}
                        onChange={() => toggleOne(reservation.id)}
                        disabled={!selectable}
                        aria-label={`${formatDate(reservation.startTime)} ${reservation.space.name} の予約を選択`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {formatDate(reservation.startTime)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatTime(reservation.startTime)} -{" "}
                          {formatTime(reservation.endTime)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{reservation.space.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div>
                        <div className="font-medium">
                          {reservation.customer.lastName}{" "}
                          {reservation.customer.firstName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {reservation.customer.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {formatPrice(reservation.totalPrice)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <PaymentStatusBadge status={reservation.paymentStatus} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(reservation.createdAt)}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap"
                      onClick={stopRowClick}
                    >
                      {reservation.deletedAt ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          削除済み
                        </span>
                      ) : (
                        <ReservationStatusSelect
                          reservationId={reservation.id}
                          currentStatus={reservation.status}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={stopRowClick}>
                      <ReservationActionCell
                        reservationId={reservation.id}
                        isDeleted={reservation.deletedAt != null}
                      />
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 一括操作バー */}
      <ReservationBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
