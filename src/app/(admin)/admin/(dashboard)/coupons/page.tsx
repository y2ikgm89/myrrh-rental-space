import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { getCoupons } from "@/admin/queries/coupon";
import { CouponFilters } from "./_components/CouponFilters";
import { CouponTable } from "./_components/CouponTable";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import {
  COUPON_STATUS_FILTER_ALL,
  COUPON_TYPE_FILTER_ALL,
  loadAdminCouponSearchParams,
} from "@/shared/lib/nuqs";
import { deriveCouponStatusesNow } from "./_lib/coupon-status";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "クーポン管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function CouponList({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await loadAdminCouponSearchParams(searchParams);

  // sentinel `"ALL"` は filter 未指定として扱う。`parseAsStringLiteral` が
  // validation 責務を担うため page 側でローカル narrowing helper は不要。
  const status =
    params.status === COUPON_STATUS_FILTER_ALL ? undefined : params.status;
  const type = params.type === COUPON_TYPE_FILTER_ALL ? undefined : params.type;

  const result = await getCoupons(
    {
      ...(status && { status }),
      ...(type && { type }),
      ...(params.search && { search: params.search }),
    },
    { page: params.page, limit: params.perPage },
  );

  // Server Component 側で派生ステータスを pre-compute し Client Badge に
  // 渡す（render 中の `new Date()` を helper に閉じ込めて React Compiler
  // `purity` ルールに準拠する公式パターン）。
  const couponsWithStatus = deriveCouponStatusesNow(result.coupons);

  return (
    <>
      <CouponTable coupons={couponsWithStatus} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

export default async function CouponsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            クーポン管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            クーポンの作成・管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/coupons/new">
            <IconPlus className="mr-2 h-4 w-4" />
            新規クーポン
          </Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CouponFilters />
      </Suspense>

      {/* クーポン一覧 */}
      <Suspense fallback={<LoadingState />}>
        <CouponList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
