/**
 * 本日の予約セクション
 */

import { connection } from "next/server";
import Link from "next/link";
import { getTodayReservations } from "@/admin/queries/dashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui/table";
import { ReservationStatusBadge } from "@/admin/components/status-badges";
import { EmptyState } from "@/admin/components/EmptyState";
import { formatTimeShort } from "@/shared/lib/date-format";
import { DashboardSectionError } from "./DashboardSectionError";
import { settleDashboardLoad } from "./settle-dashboard-load";

export async function DashboardTodaySection() {
  await connection();

  const result = await settleDashboardLoad(() => getTodayReservations());

  if (!result.ok) {
    return <DashboardSectionError title="本日の予約" />;
  }

  const todayReservations = result.value;

  return (
    <Card>
      <CardHeader>
        <CardTitle>本日の予約</CardTitle>
        <CardDescription>
          {todayReservations.length > 0
            ? `${String(todayReservations.length)}件の予約があります`
            : "本日の予約はありません"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {todayReservations.length === 0 ? (
          <EmptyState
            message="本日の予約はありません"
            description="今日の利用予定が表示されます。"
            action={{ label: "予約一覧を見る", href: "/admin/reservations" }}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時間</TableHead>
                  <TableHead>スペース</TableHead>
                  <TableHead className="hidden md:table-cell">お客様</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayReservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell>
                      {formatTimeShort(reservation.startTime)} -{" "}
                      {formatTimeShort(reservation.endTime)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/reservations/${reservation.id}`}
                        className="hover:underline"
                      >
                        {reservation.spaceName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {reservation.customerName}
                    </TableCell>
                    <TableCell>
                      <ReservationStatusBadge status={reservation.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
