import { connection } from "next/server";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { listInquiryTags } from "@/admin/queries/inquiry";
import { Button } from "@/admin/components/ui";
import { InquiryTagManager } from "./_components/InquiryTagManager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせタグ管理 | Myrrh Rental Space",
};

export default async function InquiryTagsPage() {
  await connection();
  const tags = await listInquiryTags();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="お問い合わせ一覧へ戻る"
        >
          <Link href="/admin/inquiries">
            <IconArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            お問い合わせタグ管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            一覧・詳細画面で使うタグのマスタを管理します
          </p>
        </div>
      </div>

      <InquiryTagManager tags={tags} />
    </div>
  );
}
