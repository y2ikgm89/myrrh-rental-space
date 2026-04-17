import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getAllEmailTemplates } from "@/shared/domain/email-templates/queries";
import { EmailTemplateTable } from "./_components/EmailTemplateTable";

export const metadata: Metadata = {
  title: "メールテンプレート",
};

async function EmailTemplatesList() {
  await connection();
  const templates = await getAllEmailTemplates();
  return <EmailTemplateTable templates={templates} />;
}

export default function EmailTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            メールテンプレート
          </h1>
          <p className="text-muted-foreground">
            送信されるメールの件名・挨拶文・導入文・締め文を編集できます
          </p>
        </div>
        <Link
          href="/admin/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 設定に戻る
        </Link>
      </div>
      <Suspense fallback={<div>読み込み中...</div>}>
        <EmailTemplatesList />
      </Suspense>
    </div>
  );
}
