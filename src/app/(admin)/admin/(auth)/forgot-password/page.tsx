import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方 | 管理画面",
  robots: { index: false, follow: false },
};

export default async function AdminForgotPasswordPage(): Promise<ReactElement> {
  const user = await getCurrentAdminUser();
  if (user) redirect("/admin");

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            パスワードをお忘れの方
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ご登録のメールアドレスを入力してください。
            <br />
            パスワードリセットのリンクをお送りします。
          </p>
        </div>

        <div className="rounded-md border bg-card p-6 shadow-sm sm:p-8">
          <ForgotPasswordForm turnstileSiteKey={turnstileSiteKey} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/admin/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            ログインページに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
