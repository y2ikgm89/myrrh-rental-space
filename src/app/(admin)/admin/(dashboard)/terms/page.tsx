/**
 * 利用規約管理ページ
 *
 * 2タブ構造で規約一覧・SEOを管理
 * - 規約一覧: スペース用規約のバージョン管理
 * - メタ情報: サイト全体の利用規約ページ（/terms）のメタ情報
 */

import { Suspense } from "react";
import Link from "next/link";
import { getTermsList, getSiteWideTermsSeo } from "@/admin/actions/terms";
import { TermsList } from "./_components/TermsList";
import { TermsSeoForm } from "./_components/TermsSeoForm";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { loadAdminTermsSearchParams } from "@/shared/lib/nuqs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

// ==============================================================================
// 規約一覧タブのコンポーネント
// ==============================================================================

async function TermsListContent() {
  const result = await getTermsList();

  if (!result.success) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }

  return <TermsList terms={result.data ?? []} />;
}

// ==============================================================================
// SEOタブのコンポーネント
// ==============================================================================

async function SeoContent() {
  const result = await getSiteWideTermsSeo();

  if (!result.success) {
    return (
      <div className="text-center py-8 text-destructive">{result.error}</div>
    );
  }

  if (!result.data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        サイト全体の利用規約が見つかりません。
        <br />
        「規約一覧」タブから利用規約を作成し、「サイト全体」に設定してください。
      </div>
    );
  }

  return <TermsSeoForm seoData={result.data} />;
}

// ==============================================================================
// メインページコンポーネント
// ==============================================================================

export default async function TermsPage({ searchParams }: PageProps) {
  const params = await loadAdminTermsSearchParams(searchParams);
  const currentTab = params.tab;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">利用規約管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペースに紐づける利用規約を管理します。バージョン管理により変更履歴を追跡できます。
          </p>
        </div>
        {currentTab === "list" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/terms/new">規約を追加</Link>
          </Button>
        )}
      </div>

      {/* タブ */}
      <Tabs defaultValue={currentTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="list" asChild>
            <Link href="/admin/terms?tab=list">規約一覧</Link>
          </TabsTrigger>
          <TabsTrigger value="meta" asChild>
            <Link href="/admin/terms?tab=meta">メタ情報</Link>
          </TabsTrigger>
        </TabsList>

        {/* 規約一覧タブ */}
        <TabsContent value="list">
          <Suspense fallback={<LoadingState />}>
            <TermsListContent />
          </Suspense>
        </TabsContent>

        {/* SEOタブ */}
        <TabsContent value="meta">
          <Suspense fallback={<LoadingState />}>
            <SeoContent />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
