import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/lib/auth";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ResetPasswordForm } from "./_components/reset-password-form";

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
      <Container variant="narrow">
        <Stack gap="lg" className="py-16">
          <Heading level={1} className="text-center">
            無効なリンク
          </Heading>
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
    );
  }

  return (
    <Container variant="narrow">
      <Stack gap="lg" className="py-16">
        <Heading level={1} className="text-center">
          新しいパスワードを設定
        </Heading>
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
  );
}
