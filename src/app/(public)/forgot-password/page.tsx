import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/lib/auth";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  return (
    <Container variant="narrow">
      <Stack gap="lg" className="py-16">
        <Heading level={1} className="text-center">
          パスワードをお忘れの方
        </Heading>
        <p className="text-center text-muted-foreground">
          ご登録のメールアドレスを入力してください。
          パスワードリセットのリンクをお送りします。
        </p>
        <ForgotPasswordForm />
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
  );
}
