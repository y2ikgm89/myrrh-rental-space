/**
 * 最近の予約・お問い合わせセクション
 *
 * reservation:read / inquiry:read を個別に gate する（片側だけのロールでも redirect しない）。
 */

import { connection } from "next/server";
import Link from "next/link";
import {
  getRecentReservations,
  getRecentInquiries,
  type RecentInquiry,
  type RecentReservation,
} from "@/admin/queries/dashboard";
import { requireAdminDashboardAccess } from "@/admin/queries/_helpers";
import { hasPermission } from "@/shared/lib/admin-permissions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui/table";
import {
  ReservationStatusBadge,
  InquiryStatusBadge,
} from "@/admin/components/status-badges";
import { EmptyState } from "@/admin/components/EmptyState";
import { formatMonthDayTime } from "@/shared/lib/date-format";
import { DashboardSectionError } from "./DashboardSectionError";
import { settleDashboardLoad } from "./settle-dashboard-load";

export async function DashboardRecentSection() {
  await connection();

  const result = await settleDashboardLoad(async () => {
    const user = await requireAdminDashboardAccess();
    const canReservation = hasPermission(user.role, "reservation", "read");
    const canInquiry = hasPermission(user.role, "inquiry", "read");

    if (!canReservation && !canInquiry) {
      return null;
    }

    const [recentReservations, recentInquiries] = await Promise.all([
      canReservation
        ? getRecentReservations(5)
        : Promise.resolve([] as RecentReservation[]),
      canInquiry
        ? getRecentInquiries(5)
        : Promise.resolve([] as RecentInquiry[]),
    ]);

    return {
      canReservation,
      canInquiry,
      recentReservations,
      recentInquiries,
    };
  });

  if (!result.ok) {
    return <DashboardSectionError title="最近の予約・お問い合わせ" />;
  }

  if (result.value === null) {
    return null;
  }

  const { canReservation, canInquiry, recentReservations, recentInquiries } =
    result.value;

  return (
    <div className="grid gap-6 @3xl/main:grid-cols-2">
      {canReservation ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>最近の予約</CardTitle>
              <CardDescription>直近5件</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/reservations">すべて表示</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentReservations.length === 0 ? (
              <EmptyState message="予約データがありません" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日時</TableHead>
                    <TableHead>スペース</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentReservations.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell className="text-sm">
                        {formatMonthDayTime(reservation.startTime)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/reservations/${reservation.id}`}
                          className="hover:underline"
                        >
                          {reservation.spaceName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ReservationStatusBadge status={reservation.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canInquiry ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>最近のお問い合わせ</CardTitle>
              <CardDescription>直近5件</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/inquiries">すべて表示</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentInquiries.length === 0 ? (
              <EmptyState message="お問い合わせデータがありません" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日時</TableHead>
                    <TableHead>件名</TableHead>
                    <TableHead>ステータス</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInquiries.map((inquiry) => (
                    <TableRow key={inquiry.id}>
                      <TableCell className="text-sm">
                        {formatMonthDayTime(inquiry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/inquiries/${inquiry.id}`}
                          className="hover:underline"
                        >
                          <span className="text-muted-foreground mr-2 text-xs">
                            {inquiry.receiptNumber}
                          </span>
                          {inquiry.subject}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <InquiryStatusBadge status={inquiry.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
