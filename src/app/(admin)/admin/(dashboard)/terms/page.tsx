import { Suspense } from "react";
import { connection } from "next/server";
import { getTermsList } from "@/admin/queries/terms";
import { TermsTable } from "./_components/TermsTable";
import { TermsTypeSelectDialog } from "./_components/TermsTypeSelectDialog";
import { LoadingState } from "@/admin/components/LoadingState";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

async function TermsListContent() {
  await connection();
  // WARN: 全件取得 — 50件超の運用が見込まれる場合はページネーション + 検索を追加
  const terms = await getTermsList();
  return <TermsTable terms={terms} />;
}

export default async function TermsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            利用規約管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペースに紐づける利用規約を管理します。バージョン管理により変更履歴を追跡できます。
          </p>
        </div>
        <TermsTypeSelectDialog />
      </div>
      <Suspense fallback={<LoadingState />}>
        <TermsListContent />
      </Suspense>
    </div>
  );
}
