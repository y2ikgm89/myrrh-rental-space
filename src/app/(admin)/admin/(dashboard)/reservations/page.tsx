import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconCalendar, IconDownload, IconPlus } from "@tabler/icons-react";
import {
  getReservations,
  getSpacesForReservation,
} from "@/admin/queries/reservation";
import { ReservationFilters } from "./_components/ReservationFilters";
import { ReservationTable } from "./_components/ReservationTable";
import { ReservationTabs } from "./_components/ReservationTabs";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminReservationSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "予約管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function ReservationList({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await loadAdminReservationSearchParams(searchParams);

  const result = await getReservations(
    omitUndefined({
      tab: params.tab,
      search: params.search || undefined,
      startDate: params.dateFrom || undefined,
      endDate: params.dateTo || undefined,
      userId: params.userId || undefined,
      spaceId: params.spaceId || undefined,
    }),
    {
      page: params.page,
      limit: params.perPage,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    },
  );

  return (
    <>
      <ReservationTable reservations={result.reservations} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

export default async function ReservationsPage({ searchParams }: PageProps) {
  const params = await loadAdminReservationSearchParams(searchParams);
  const spaces = await getSpacesForReservation();

  // Round-4 audit Finding #13: CSV export は「今画面に見えている行」を
  // 期待して押されるため、一覧と同じ filter (tab/search/期間/userId) を
  // クエリ文字列で export route に引き継ぐ (AuditLogFilters.tsx の
  // 既存パターンと同型)。
  const exportParams = new URLSearchParams();
  if (params.tab) exportParams.set("tab", params.tab);
  if (params.search) exportParams.set("search", params.search);
  if (params.dateFrom) exportParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) exportParams.set("dateTo", params.dateTo);
  if (params.userId) exportParams.set("userId", params.userId);
  if (params.spaceId) exportParams.set("spaceId", params.spaceId);
  const exportHref = `/api/admin/export/reservations${
    exportParams.size > 0 ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            予約管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            予約の確認・ステータス変更・キャンセル処理を行います
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/reservations/new">
              <IconPlus className="mr-2 h-4 w-4" />
              新規予約
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/reservations/calendar">
              <IconCalendar className="mr-2 h-4 w-4" />
              カレンダー表示
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref} download>
              <IconDownload className="mr-2 h-4 w-4" />
              CSV
            </a>
          </Button>
        </div>
      </div>

      {/* タブ（ステータス別分類） */}
      <ReservationTabs />

      {/* フィルター（期間 + 検索） */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReservationFilters spaces={spaces} />
      </Suspense>

      {/* 予約一覧（タブ切替ごとに subtree を作り直す＝events と同じ Pattern A の keyed 動的ホール） */}
      <Suspense key={params.tab} fallback={<LoadingState />}>
        <ReservationList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
