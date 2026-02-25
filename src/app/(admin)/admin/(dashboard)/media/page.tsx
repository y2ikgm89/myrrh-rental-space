/**
 * メディア管理ページ
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { loadAdminMediaSearchParams } from "@/shared/lib/nuqs";
import { MediaFilters } from "./_components/MediaFilters";
import { MediaListWrapper } from "./_components/MediaListWrapper";
import { LoadingState } from "@/admin/components/LoadingState";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "メディア管理",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function MediaListWithLoader({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await loadAdminMediaSearchParams(searchParams);
  return <MediaListWrapper searchParams={params} />;
}

export default async function MediaPage({ searchParams }: PageProps) {
  await connection();
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">メディア管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            画像・動画・ドキュメントの一元管理
          </p>
        </div>
      </div>

      {/* Filters */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <MediaFilters />
      </Suspense>

      {/* Media List */}
      <Suspense fallback={<MediaGridSkeleton />}>
        <MediaListWithLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square bg-muted animate-pulse rounded-lg"
        />
      ))}
    </div>
  );
}
