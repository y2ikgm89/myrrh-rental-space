import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { ReservationStatusBadge } from "@/admin/components/status-badges";
import { ReservationStatusSelect } from "./ReservationStatusSelect";
import { ResourceActionCell } from "@/admin/components/ResourceActionCell";
import type { ReservationWithRelations } from "@/admin/actions/reservation";
import { formatPrice } from "@/shared/lib/utils";
import { EmptyState } from "@/admin/components/EmptyState";

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

// =============================================================================
// ReservationTable Component (Server Component)
// =============================================================================

export function ReservationTable({ reservations }: ReservationTableProps) {
  if (reservations.length === 0) {
    return (
      <EmptyState
        message="予約がありません"
        action={{ label: "新規予約", href: "/admin/reservations/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>予約日時</TableHead>
              <TableHead>スペース</TableHead>
              <TableHead className="hidden lg:table-cell">顧客</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                料金
              </TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((reservation) => (
              <TableRow key={reservation.id}>
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
                <TableCell>
                  <ReservationStatusBadge status={reservation.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block">
                      <ReservationStatusSelect
                        reservationId={reservation.id}
                        currentStatus={reservation.status}
                      />
                    </div>
                    <ResourceActionCell
                      actions={[
                        {
                          label: "編集",
                          href: `/admin/reservations/${reservation.id}/edit`,
                        },
                        {
                          label: "詳細",
                          href: `/admin/reservations/${reservation.id}`,
                        },
                      ]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
