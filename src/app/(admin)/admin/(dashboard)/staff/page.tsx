import { Suspense } from "react";
import Link from "next/link";
import { getUsers } from "@/admin/queries/user";
import { getPendingInvitations } from "@/admin/queries/staff-invitation";
import { loadAdminUserSearchParams } from "@/shared/lib/nuqs";
import { getRoleFilterOrAll } from "@/shared/lib/validations/enums";
import { omitUndefined } from "@/shared/lib/serialize";
import { Button, Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import {
  StaffStats,
  StaffFilters,
  StaffTable,
  InvitationTable,
} from "./_components";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフ管理 | Myrrh Rental Space",
};

// =============================================================================
// URL パラメータバリデーション
// =============================================================================

type SortBy = "name" | "email" | "role" | "createdAt";
type SortOrder = "asc" | "desc";

const VALID_SORT_BY_VALUES = [
  "name",
  "email",
  "role",
  "createdAt",
] as const satisfies readonly SortBy[];
const VALID_SORT_BY_SET = new Set<string>(VALID_SORT_BY_VALUES);

function isValidSortBy(value: string): value is SortBy {
  return VALID_SORT_BY_SET.has(value);
}

function validateSortBy(value: string): SortBy {
  return isValidSortBy(value) ? value : "createdAt";
}

function validateSortOrder(value: string): SortOrder {
  return value === "asc" || value === "desc" ? value : "desc";
}

// =============================================================================
// 非同期データコンポーネント
// =============================================================================

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function StaffList({ searchParams }: PageProps) {
  const params = await loadAdminUserSearchParams(searchParams);
  const result = await getUsers(
    omitUndefined({
      page: params.page,
      perPage: params.perPage,
      search: params.search || undefined,
      role: getRoleFilterOrAll(params.role),
      sortBy: validateSortBy(params.sortBy),
      sortOrder: validateSortOrder(params.sortOrder),
    }),
  );

  return (
    <>
      <StaffTable users={result.users} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

async function InvitationSection() {
  const invitations = await getPendingInvitations();
  if (invitations.length === 0) return null;
  return <InvitationTable invitations={invitations} />;
}

// =============================================================================
// メインページ
// =============================================================================

export default async function StaffPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            スタッフ管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            管理画面にアクセスできるスタッフアカウントを管理します
          </p>
        </div>
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/staff/new">スタッフを招待</Link>
        </Button>
      </div>

      {/* スタッツカード */}
      <Suspense fallback={<LoadingState />}>
        <StaffStats />
      </Suspense>

      {/* 招待中 */}
      <Suspense fallback={null}>
        <InvitationSection />
      </Suspense>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <StaffFilters />
      </Suspense>

      {/* テーブル + ページネーション */}
      <Suspense fallback={<LoadingState />}>
        <StaffList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
