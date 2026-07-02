import { Suspense } from "react";
import { connection } from "next/server";
import { getAuditLogs } from "@/admin/queries/audit-log";
import { loadAdminAuditLogSearchParams } from "@/shared/lib/nuqs";
import { getAuditActionFilterOrAll } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "@/shared/lib/serialize";
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
  await connection();
  const params = await loadAdminAuditLogSearchParams(searchParams);
  const logs = await getAuditLogs(
    omitUndefined({
      page: params.page,
      perPage: params.perPage,
      action: getAuditActionFilterOrAll(params.action),
      resource: params.resource || undefined,
      userId: params.userId || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
      search: params.search || undefined,
      ipAddress: params.ipAddress || undefined,
      securityOnly: params.securityOnly === "1",
    }),
  );

  return (
    <>
      <AuditLogTable logs={logs.logs} />
      <Pagination
        currentPage={logs.page}
        totalPages={logs.totalPages}
        total={logs.total}
        perPage={params.perPage}
      />
    </>
  );
}

export default async function AuditLogsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          監査ログ
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          システム操作の履歴を確認します
        </p>
      </div>

      {/* スタッツカード */}
      <Suspense fallback={<LoadingState />}>
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
