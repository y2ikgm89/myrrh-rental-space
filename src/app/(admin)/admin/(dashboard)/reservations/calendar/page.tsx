import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconList } from "@tabler/icons-react";
import {
  getReservationsForCalendar,
  getSpacesForCalendar,
} from "@/admin/queries/reservation";
import {
  getCalendarDateRange,
  getValidCalendarView,
} from "@/admin/lib/calendar";
import { getReservationStatusFilterOrAll } from "@/shared/lib/validations/enums/helpers";
import { loadAdminCalendarSearchParams } from "@/shared/lib/nuqs";
import { CalendarViewWrapper } from "../_components/calendar/CalendarViewWrapper";
import { Button, Breadcrumb } from "@/admin/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "予約カレンダー | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface PageProps {
  searchParams: SearchParams;
}

function CalendarSkeleton() {
  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="flex-1 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

async function CalendarData({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminCalendarSearchParams(searchParams);
  const view = getValidCalendarView(params.view, "week");
  // eslint-disable-next-line @eslint-react/purity -- Server Component: new Date() used after data fetch
  const date = params.date ? new Date(params.date) : new Date();
  const spaceId = params.spaceId || undefined;
  const status = getReservationStatusFilterOrAll(params.status);

  const dateRange = getCalendarDateRange(date, view);

  const [events, spaces] = await Promise.all([
    getReservationsForCalendar(dateRange.start, dateRange.end, spaceId, status),
    getSpacesForCalendar(),
  ]);

  return <CalendarViewWrapper initialEvents={events} spaces={spaces} />;
}

export default async function ReservationCalendarPage({
  searchParams,
}: PageProps) {
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col space-y-6">
      <Breadcrumb
        items={[
          { label: "予約管理", href: "/admin/reservations" },
          { label: "カレンダー" },
        ]}
      />

      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            予約カレンダー
          </h1>
          <p className="text-muted-foreground">
            予約をカレンダー形式で確認・管理します
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/reservations">
            <IconList className="mr-2 h-4 w-4" />
            リスト表示
          </Link>
        </Button>
      </div>

      {/* カレンダー */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<CalendarSkeleton />}>
          <CalendarData searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
