import { Suspense } from "react";
import { getNotifications } from "@/admin/queries/notification";
import { loadAdminNotificationSearchParams } from "@/shared/lib/nuqs";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { NotificationFilters } from "./_components/NotificationFilters";
import { NotificationTable } from "./_components/NotificationTable";
import { MarkAllReadButton } from "./_components/MarkAllReadButton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "通知 | 管理画面",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function NotificationListSection({ searchParams }: PageProps) {
  const params = await loadAdminNotificationSearchParams(searchParams);

  const isReadFilter =
    params.isRead === "unread"
      ? false
      : params.isRead === "read"
        ? true
        : undefined;

  const queryParams: {
    page: number;
    perPage: number;
    type?: string;
    isRead?: boolean;
  } = {
    page: params.page,
    perPage: params.perPage,
  };
  if (params.type) queryParams.type = params.type;
  if (isReadFilter !== undefined) queryParams.isRead = isReadFilter;

  const data = await getNotifications(queryParams);

  const notifications = data.notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <NotificationTable notifications={notifications} />
      <Pagination
        currentPage={data.page}
        totalPages={data.totalPages}
        total={data.total}
      />
    </>
  );
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            通知
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            システムからの通知を確認します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MarkAllReadButton />
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <NotificationFilters />
      </Suspense>

      {/* テーブル + ページネーション */}
      <Suspense fallback={<LoadingState />}>
        <NotificationListSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
