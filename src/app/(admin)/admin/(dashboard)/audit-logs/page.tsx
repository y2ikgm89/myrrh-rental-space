import { Suspense } from "react";
import { getAuditLogs } from "@/admin/actions/audit-log";
import { loadAdminAuditLogSearchParams } from "@/shared/lib/nuqs";
import { getAuditActionFilterOrAll } from "@/shared/lib/validations/enums";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { AuditLogStats } from "./_components/AuditLogStats";
import { AuditLogTable } from "./_components/AuditLogTable";
import { AuditLogFilters } from "./_components/AuditLogFilters";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "監査ログ | Myrrh Rental Space",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function AuditLogList({ searchParams }: PageProps) {
  const params = await loadAdminAuditLogSearchParams(searchParams);
  const logsResult = await getAuditLogs({
    page: params.page,
    perPage: params.perPage,
    action: getAuditActionFilterOrAll(params.action),
    resource: params.resource || undefined,
    userId: params.userId || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
  });

  const logs =
    logsResult.success && "data" in logsResult
      ? logsResult.data
      : { logs: [], total: 0, page: 1, totalPages: 1 };

  return (
    <>
      <AuditLogTable logs={logs.logs} />
      <Pagination
        currentPage={logs.page}
        totalPages={logs.totalPages}
        total={logs.total}
      />
    </>
  );
}

export default async function AuditLogsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">監査ログ</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            システム操作の履歴を確認します
          </p>
        </div>
      </div>

      {/* スタッツカード */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-6 animate-pulse"
              >
                <div className="h-4 bg-muted rounded w-20 mb-3" />
                <div className="h-8 bg-muted rounded w-12" />
              </div>
            ))}
          </div>
        }
      >
        <AuditLogStats />
      </Suspense>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <AuditLogFilters />
      </Suspense>

      {/* テーブル + ページネーション */}
      <Suspense fallback={<LoadingState />}>
        <AuditLogList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
