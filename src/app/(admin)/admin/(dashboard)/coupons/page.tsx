import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCoupons } from "@/admin/queries/coupon";
import { CouponFilters } from "./_components/CouponFilters";
import { CouponTable } from "./_components/CouponTable";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { isValidCouponType } from "@/shared/lib/validations/enums";
import { loadAdminCouponSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "クーポン管理 | Myrrh Rental Space",
};

// クーポンステータスフィルターの型定義
const COUPON_STATUS_FILTERS = [
  "active",
  "inactive",
  "expired",
  "limitReached",
  "notStarted",
] as const;
type CouponStatusFilter = (typeof COUPON_STATUS_FILTERS)[number];

const COUPON_STATUS_FILTERS_SET = new Set<string>(COUPON_STATUS_FILTERS);
function isValidCouponStatusFilter(
  value: unknown,
): value is CouponStatusFilter {
  return typeof value === "string" && COUPON_STATUS_FILTERS_SET.has(value);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function CouponList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminCouponSearchParams(searchParams);
  const status = isValidCouponStatusFilter(params.status)
    ? params.status
    : undefined;
  const type = isValidCouponType(params.type) ? params.type : undefined;

  const result = await getCoupons(
    { status, type, search: params.search || undefined },
    { page: params.page, limit: 10 },
  );

  return (
    <>
      <CouponTable coupons={result.coupons} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">クーポン管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            クーポンの作成・管理を行います
          </p>
        </div>
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/coupons/new">
            <Plus className="mr-2 h-4 w-4" />
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

