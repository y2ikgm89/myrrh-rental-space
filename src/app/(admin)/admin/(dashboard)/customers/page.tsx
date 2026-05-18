import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconDownload, IconPlus } from "@tabler/icons-react";
import { getCustomers } from "@/admin/queries/customer";
import { CustomerFilters } from "./_components/CustomerFilters";
import { CustomerTable } from "./_components/CustomerTable";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseCustomerStatusFilter } from "@/shared/lib/validations/enums/helpers";
import { loadAdminCustomerSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "顧客管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminCustomerSearchParams(searchParams);
  const status = parseCustomerStatusFilter(params.status);

  const result = await getCustomers(
    omitUndefined({
      status,
      customerType: params.customerType,
      search: params.search || undefined,
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
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/customers/new">
              <IconPlus className="mr-2 h-4 w-4" />
              新規顧客
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/admin/export/customers" download>
              <IconDownload className="mr-2 h-4 w-4" />
              CSV
            </a>
          </Button>
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
