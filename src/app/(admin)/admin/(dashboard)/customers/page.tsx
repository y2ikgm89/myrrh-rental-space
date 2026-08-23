import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconDownload, IconPlus } from "@tabler/icons-react";
import { getCustomers } from "@/admin/queries/customer";
import { requireAdminDashboardPage } from "@/admin/helpers/page-auth";
import { CustomerFilters } from "./_components/CustomerFilters";
import { CustomerTable } from "./_components/CustomerTable";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseCustomerStatusFilter } from "@/shared/lib/validations/enums/helpers";
import {
  CUSTOMER_TYPE_FILTER_ALL,
  loadAdminCustomerSearchParams,
} from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "顧客管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

/**
 * CSV リンクに乗せるクエリ文字列。一覧と同じ parser を通すので、
 * 画面に見えている行と CSV の中身がずれない（監査 A-32）。
 * 並び順やページは export に関係しないので載せない。
 */
async function buildCustomerExportParams(
  searchParams: SearchParams,
): Promise<string> {
  const params = await loadAdminCustomerSearchParams(searchParams);
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.customerType !== CUSTOMER_TYPE_FILTER_ALL) {
    query.set("customerType", params.customerType);
  }
  if (params.flaggedOnly) query.set("flaggedOnly", "true");
  const serialized = query.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminCustomerSearchParams(searchParams);
  const status = parseCustomerStatusFilter(params.status);

  const result = await getCustomers(
    omitUndefined({
      status,
      customerType: params.customerType,
      search: params.search || undefined,
      flaggedOnly: params.flaggedOnly || undefined,
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
      <CustomerTable customers={result.customers} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const user = await requireAdminDashboardPage();
  // CSV は一覧と同じ絞り込みで出す（監査 A-32）。
  // 以前は無引数の全件 export だったので、件数が育ったときに範囲を狭める
  // 手段が UI にも URL にも無かった。上限超過時の 409 からの逆引きもこれが無いと終わる。
  const exportParams = await buildCustomerExportParams(searchParams);
  const canExportCustomers = hasPermission(user.role, "customer", "manage");
  // 作成導線は機能フラグだけでなく権限も見る（監査 A-13）。
  // コマンドパレットは同じ遷移先を `hasPermission(role, resource, "create")` で
  // 消しており、こちらだけが出したままだった。
  const canCreateCustomer = hasPermission(user.role, "customer", "create");

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            顧客管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            顧客情報の確認・ステータス管理を行います
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateCustomer ? (
            <Button asChild>
              <Link href="/admin/customers/new">
                <IconPlus className="mr-2 h-4 w-4" />
                新規顧客
              </Link>
            </Button>
          ) : null}
          {canExportCustomers ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/admin/export/customers${exportParams}`} download>
                <IconDownload className="mr-2 h-4 w-4" />
                CSV
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CustomerFilters />
      </Suspense>

      {/* 顧客一覧 */}
      <Suspense fallback={<LoadingState />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
