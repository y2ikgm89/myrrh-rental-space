/**
 * 本日の予約セクション
 */

import { connection } from "next/server";
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
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export async function DashboardTodaySection() {
  await connection();
  const todayReservations = await getTodayReservations();

  if (todayReservations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>本日の予約</CardTitle>
        <CardDescription>
          {todayReservations.length}件の予約があります
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    {format(reservation.startTime, "HH:mm", { locale: ja })} -{" "}
                    {format(reservation.endTime, "HH:mm", { locale: ja })}
                  </TableCell>
                  <TableCell>{reservation.spaceName}</TableCell>
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
      </CardContent>
    </Card>
  );
}
