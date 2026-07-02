import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { IconTrash } from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import {
  getAdminTermsList,
  getDeletedTermsCount,
} from "@/shared/domain/terms/admin-queries";
import { TermsTable } from "./_components/TermsTable";
import { TermsTypeSelectDialog } from "./_components/TermsTypeSelectDialog";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

export default async function AdminTermsPage() {
  await connection();

  const [items, deletedCount] = await Promise.all([
    getAdminTermsList(),
    getDeletedTermsCount(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            利用規約管理
          </h1>
          <p className="text-muted-foreground">
            サイト規約・プライバシーポリシー・キャンセルポリシー等を管理
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="destructive" size="sm">
            <Link href="/admin/terms/trash">
              <IconTrash className="mr-2 h-4 w-4" />
              ゴミ箱
              {deletedCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {deletedCount}
                </Badge>
              )}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/terms/agreements">同意記録</Link>
          </Button>
          <TermsTypeSelectDialog />
        </div>
      </div>

      <TermsTable items={items} />
    </div>
  );
}
