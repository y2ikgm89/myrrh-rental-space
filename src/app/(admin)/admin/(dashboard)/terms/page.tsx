import { Suspense } from "react";
import Link from "next/link";
import { getTermsList } from "@/admin/actions/terms";
import { TermsList } from "./_components/TermsList";
import { Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

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

export default async function TermsPage() {
  await connection();
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
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/terms/new">規約を追加</Link>
        </Button>
      </div>
      <Suspense fallback={<LoadingState />}>
        <TermsListContent />
      </Suspense>
    </div>
  );
}
