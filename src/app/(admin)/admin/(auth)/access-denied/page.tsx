import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/admin/components/ui/button";

export const metadata: Metadata = {
  title: "管理権限がありません | 管理画面",
};

export default async function AdminAccessDeniedPage() {
  await connection();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          Google IAP 認証済み
        </p>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          管理権限がありません
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Googleログインは完了していますが、このGoogleアカウントは管理スタッフとして登録されていません。
          管理者に、IAPアクセスとスタッフ登録の両方を確認してもらってください。
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/admin">管理画面を再確認</Link>
        </Button>
      </section>
    </main>
  );
}
