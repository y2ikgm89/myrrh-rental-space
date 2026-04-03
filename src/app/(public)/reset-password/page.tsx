import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/lib/auth";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { PageHero } from "@/public/components/layouts/page-hero";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata: Metadata = {
  title: "パスワードリセット",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  const params = await searchParams;
  const token = typeof params["token"] === "string" ? params["token"] : null;

  if (!token) {
    return (
      <>
        <PageHero variant="minimal" title="無効なリンク" />

        <Container variant="narrow">
          <Stack gap="lg" className="pb-[var(--spacing-block)]">
            <p className="text-center text-muted-foreground">
              パスワードリセットのリンクが無効です。
              有効期限が切れている可能性があります。
            </p>
            <p className="text-center">
              <Link
                href="/forgot-password"
                className="text-accent underline underline-offset-4 hover:text-accent/80"
              >
                パスワードリセットを再リクエスト
              </Link>
            </p>
          </Stack>
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHero variant="minimal" title="新しいパスワードを設定" />

      <Container variant="narrow">
        <Stack gap="lg" className="pb-[var(--spacing-block)]">
          <p className="text-center text-muted-foreground">
            新しいパスワードを入力してください。
          </p>
          <ResetPasswordForm token={token} />
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="text-accent underline underline-offset-4 hover:text-accent/80"
            >
              ログインページに戻る
            </Link>
          </p>
        </Stack>
      </Container>
    </>
  );
}
