import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { getEvents } from "@/shared/domain/events/admin-queries";
import {
  EVENT_STATUS_FILTER_ALL,
  loadAdminEventSearchParams,
} from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { EventFilters } from "./_components/EventFilters";
import { EventTable } from "./_components/EventTable";
import { EventTabs } from "./_components/EventTabs";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "イベント管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function EventList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminEventSearchParams(searchParams);
  // parser が EventStatusFilter に narrow 済。"ALL" のときは status フィルタなし
  const status =
    params.status === EVENT_STATUS_FILTER_ALL ? undefined : params.status;

  const result = await getEvents(
    omitUndefined({
      search: params.search || undefined,
      status,
      tab: params.tab,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
      page: params.page,
      perPage: params.perPage,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    }),
  );

  return (
    <>
      <EventTable events={result.events} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

export default async function EventsPage({ searchParams }: PageProps) {
  const params = await loadAdminEventSearchParams(searchParams);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            イベント管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            イベントの作成・編集・公開を管理します
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/events/new">
            <IconPlus className="mr-2 h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {/* タブ（時間軸 + ステータスで分類） */}
      <EventTabs activeTab={params.tab} />

      {/* フィルター */}
      <EventFilters />

      {/* テーブル */}
      <Suspense key={params.tab} fallback={<LoadingState />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
