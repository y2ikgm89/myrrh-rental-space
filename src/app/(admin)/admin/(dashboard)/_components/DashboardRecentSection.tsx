/**
 * 最近の予約・お問い合わせセクション
 */

import { connection } from "next/server";
import Link from "next/link";
import {
  getRecentReservations,
  getRecentInquiries,
} from "@/admin/queries/dashboard";
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
import { Badge } from "@/admin/components/ui/badge";
import { EmptyState } from "@/admin/components/EmptyState";
import { formatMonthDayTime } from "@/shared/lib/date-format";

export async function DashboardRecentSection() {
  await connection();
  const [recentReservations, recentInquiries] = await Promise.all([
    getRecentReservations(5),
    getRecentInquiries(5),
  ]);

  return (
    <div className="grid gap-6 @3xl/main:grid-cols-2">
      {/* 最近の予約 */}
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

      {/* 最近のお問い合わせ */}
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
                  <TableHead>対応</TableHead>
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
                      {/* Inquiry Overhaul Phase 1: 旧 replyMessage 列は DROP されたため
                          replies 件数の 0/1+ 派生で「返信済み / 未対応」を表示する */}
                      {inquiry.hasReplies ? (
                        <Badge variant="success">返信済み</Badge>
                      ) : (
                        <Badge variant="warning">未対応</Badge>
                      )}
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
    </div>
  );
}
