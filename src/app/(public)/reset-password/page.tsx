import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { PageHero } from "@/public/components/layouts/page-hero";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata: Metadata = {
  title: "パスワードリセット",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const user = await getCurrentAdminUser();
  if (user) redirect("/admin");

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
                className="text-accent underline underline-offset-4 hover:text-foreground"
              >
                パスワードリセットを再リクエスト
              </Link>
            </p>
          </Stack>
        </Container>
      </>
    );
  }

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <>
      <PageHero variant="minimal" title="新しいパスワードを設定" />

      <Container variant="narrow">
        <Stack gap="lg" className="pb-[var(--spacing-block)]">
          <p className="text-center text-muted-foreground">
            新しいパスワードを入力してください。
          </p>
          <ResetPasswordForm
            token={token}
            turnstileSiteKey={turnstileSiteKey}
          />
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="text-accent underline underline-offset-4 hover:text-foreground"
            >
              ログインページに戻る
            </Link>
          </p>
        </Stack>
      </Container>
    </>
  );
}
