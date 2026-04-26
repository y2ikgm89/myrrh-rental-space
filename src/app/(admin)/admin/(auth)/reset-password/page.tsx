import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata: Metadata = {
  title: "パスワードリセット | 管理画面",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminResetPasswordPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  const user = await getCurrentAdminUser();
  if (user) redirect("/admin");

  const params = await searchParams;
  const token = typeof params["token"] === "string" ? params["token"] : null;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              無効なリンク
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              パスワードリセットのリンクが無効です。
              <br />
              有効期限が切れている可能性があります。
            </p>
          </div>
          <p className="text-center text-sm">
            <Link
              href="/admin/forgot-password"
              className="text-primary underline-offset-4 hover:underline"
            >
              パスワードリセットを再リクエスト
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            新しいパスワードを設定
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            新しいパスワードを入力してください。
          </p>
        </div>

        <div className="rounded-md border bg-card p-6 shadow-sm sm:p-8">
          <ResetPasswordForm
            token={token}
            turnstileSiteKey={turnstileSiteKey}
          />
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
