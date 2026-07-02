import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { IconArrowLeft } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { getDeletedTermsList } from "@/shared/domain/terms/admin-queries";
import { TermsTrashTable } from "../_components/TermsTrashTable";

export const metadata: Metadata = {
  title: "規約ゴミ箱 | Myrrh Rental Space",
  robots: { index: false, follow: false },
};

export default async function AdminTermsTrashPage() {
  await connection();

  const items = await getDeletedTermsList();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            規約ゴミ箱
          </h1>
          <p className="text-muted-foreground">
            削除済みの規約を復元または完全削除できます
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/terms">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              一覧に戻る
            </Link>
          </Button>
        </div>
      </div>

      <TermsTrashTable items={items} />
    </div>
  );
}
