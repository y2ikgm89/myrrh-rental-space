import { Suspense } from "react";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { getEvents } from "@/shared/domain/events/admin-queries";
import { loadAdminEventSearchParams } from "@/shared/lib/nuqs";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";
import { omitUndefined } from "@/shared/lib/serialize";
import { EventFilters } from "./_components/EventFilters";
import { EventTable } from "./_components/EventTable";
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
  const params = await loadAdminEventSearchParams(searchParams);
  const status = isValidEventStatus(params.status) ? params.status : undefined;

  const result = await getEvents(
    omitUndefined({
      search: params.search || undefined,
      status: status ?? undefined,
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
      />
    </>
  );
}

export default async function EventsPage({ searchParams }: PageProps) {
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
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/admin/events/new">
              <IconPlus className="mr-2 h-4 w-4" />
              新規作成
            </Link>
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <EventFilters />

      {/* テーブル */}
      <Suspense fallback={<LoadingState />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
