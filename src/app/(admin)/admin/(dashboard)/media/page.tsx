/**
 * メディア管理ページ
 */

import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { loadAdminMediaSearchParams } from "@/shared/lib/nuqs";
import { MediaFilters } from "./_components/MediaFilters";
import { MediaListWrapper } from "./_components/MediaListWrapper";
import { LoadingState } from "@/admin/components/LoadingState";
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
  await connection();
  const params = await loadAdminMediaSearchParams(searchParams);
  return <MediaListWrapper searchParams={params} />;
}

export default async function MediaPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            メディア管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            画像・動画・ドキュメントの一元管理
          </p>
        </div>
      </div>

      {/* Filters */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <MediaFilters />
      </Suspense>

      {/* Media IconList */}
      <Suspense fallback={<MediaGridSkeleton />}>
        <MediaListWithLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// 固定長 skeleton 用の安定キー（配列 index をキーにしない: @eslint-react/no-array-index-key）
const MEDIA_SKELETON_KEYS = Array.from(
  { length: 12 },
  (_, i) => `media-skeleton-${i}`,
);

function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 @md/main:grid-cols-3 @2xl/main:grid-cols-4 @4xl/main:grid-cols-6">
      {MEDIA_SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="aspect-square bg-muted animate-pulse rounded-lg"
        />
      ))}
    </div>
  );
}
