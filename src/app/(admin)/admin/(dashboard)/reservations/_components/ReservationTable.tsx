"use client";

/**
 * 予約一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル（一括操作対応）
 */

import { useState } from "react";
import { Table, TableBody, TableCell } from "@/admin/components/ui";
import { ReservationTableHeader } from "./ReservationTableHeader";
import {
  PaymentStatusBadge,
  ReservationStatusBadge,
} from "@/admin/components/status-badges";
import { ReservationStatusSelect } from "./ReservationStatusSelect";
import { ReservationActionCell } from "./ReservationActionCell";
import { ReservationBulkActions } from "./ReservationBulkActions";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { formatPrice } from "@/shared/lib/pricing/format";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
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
  /** feature OFF 時は EmptyState の新規作成を出さない */
  allowCreate?: boolean;
  /** reservation:update 権限がない (VIEWER 等) 場合は false */
  canUpdate?: boolean;
};

// =============================================================================
// Helper Functions
// =============================================================================

function isSelectable(reservation: ReservationWithRelations): boolean {
  if (reservation.deletedAt) return false;
  return !TERMINAL_RESERVATION_STATUSES.includes(reservation.status);
}

// =============================================================================
// ReservationTable Component (Client Component)
// =============================================================================

export function ReservationTable({
  reservations,
  allowCreate = true,
  canUpdate = true,
}: ReservationTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectableIds = reservations.filter(isSelectable).map((r) => r.id);

  // Round-4 audit Cluster J / Finding #10 sibling: 検索・並び替え・ページ移動で
  // reservations が入れ替わっても selectedIds はローカル state に残るため、
  // 次の「一括確定 / 一括キャンセル」で見えていない過去選択の予約まで対象になる。
  // 詳細は PostTable.tsx の該当コメント参照。可視 & 現在も selectable な id との
  // 積集合を派生。行が削除やステータス遷移で TERMINAL 化しても bulk 対象から抜ける。
  const selectableIdSet = new Set(selectableIds);
  const effectiveSelectedIds = selectedIds.filter((id) =>
    selectableIdSet.has(id),
  );

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
        {...(allowCreate
          ? { action: { label: "新規予約", href: "/admin/reservations/new" } }
          : {})}
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
              showBulkSelect={canUpdate}
            />
            <TableBody>
              {reservations.map((reservation) => {
                const selectable = isSelectable(reservation);
                return (
                  <ClickableTableRow
                    key={reservation.id}
                    href={`/admin/reservations/${reservation.id}`}
                    aria-label={`${formatDateWithWeekday(reservation.startTime)} ${reservation.space.name} の予約を表示`}
                    {...(reservation.deletedAt
                      ? { className: "opacity-50" }
                      : {})}
                  >
                    <TableCell onClick={stopRowClick}>
                      {canUpdate ? (
                        <CheckboxCell
                          checked={selectedIds.includes(reservation.id)}
                          onChange={() => toggleOne(reservation.id)}
                          disabled={!selectable}
                          aria-label={`${formatDateWithWeekday(reservation.startTime)} ${reservation.space.name} の予約を選択`}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {formatDateWithWeekday(reservation.startTime)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatTimeShort(reservation.startTime)} -{" "}
                          {formatTimeShort(reservation.endTime)}
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
                      {formatDateWithWeekday(reservation.createdAt)}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap"
                      onClick={stopRowClick}
                    >
                      {reservation.deletedAt ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          削除済み
                        </span>
                      ) : canUpdate ? (
                        <ReservationStatusSelect
                          reservationId={reservation.id}
                          currentStatus={reservation.status}
                        />
                      ) : (
                        <ReservationStatusBadge status={reservation.status} />
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={stopRowClick}>
                      <ReservationActionCell
                        reservationId={reservation.id}
                        isDeleted={reservation.deletedAt != null}
                        status={reservation.status}
                        canUpdate={canUpdate}
                      />
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 一括操作バー: 現在の画面に表示されている行だけを bulk 対象に渡す */}
      {canUpdate ? (
        <ReservationBulkActions
          selectedIds={effectiveSelectedIds}
          onClear={() => setSelectedIds([])}
        />
      ) : null}
    </>
  );
}
