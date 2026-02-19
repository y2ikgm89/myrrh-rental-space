import { Suspense } from "react";
import { getInquiries } from "@/admin/actions/inquiry";
import { InquiryFilters } from "./_components/InquiryFilters";
import { InquiryTable } from "./_components/InquiryTable";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseInquiryStatusFilter } from "@/shared/lib/validations/enums";
import { loadAdminInquirySearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "お問い合わせ管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function InquiryList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminInquirySearchParams(searchParams);
  const status = parseInquiryStatusFilter(params.status);

  const result = await getInquiries(
    { status, search: params.search || undefined },
    { page: params.page, limit: 10 },
  );

  return (
    <>
      <InquiryTable inquiries={result.inquiries} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

export default async function InquiriesPage({ searchParams }: PageProps) {
  await headers();
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">お問い合わせ管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            お問い合わせの確認・ステータス管理を行います
          </p>
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <InquiryFilters />
      </Suspense>

      {/* お問い合わせ一覧 */}
      <Suspense fallback={<LoadingState />}>
        <InquiryList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
