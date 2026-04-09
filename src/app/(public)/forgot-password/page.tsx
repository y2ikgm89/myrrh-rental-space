import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { PageHero } from "@/public/components/layouts/page-hero";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  const user = await getCurrentAdminUser();
  if (user) redirect("/mypage");

  return (
    <>
      <PageHero variant="minimal" title="パスワードをお忘れの方" />

      <Container variant="narrow">
        <Stack gap="lg" className="pb-[var(--spacing-block)]">
          <p className="text-center text-muted-foreground">
            ご登録のメールアドレスを入力してください。
            パスワードリセットのリンクをお送りします。
          </p>
          <ForgotPasswordForm />
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
