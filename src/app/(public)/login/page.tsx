import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { PageHero } from "@/public/components/layouts/page-hero";
import { getRequiredTermsAtSignup } from "@/shared/domain/terms/queries";
import { SocialLoginButtons } from "./_components/social-login-buttons";
import { DevLoginButton } from "./_components/dev-login-button";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentCustomerUser();
  if (user) redirect("/mypage");

  const requiredTerms = await getRequiredTermsAtSignup();

  const params = await searchParams;
  const errorType =
    typeof params["error"] === "string" ? params["error"] : null;

  const ERROR_MESSAGES: Record<string, string> = {
    account_suspended:
      "アカウントが停止されています。詳細はお問い合わせください。",
    auth_failed: "認証に失敗しました。もう一度お試しください。",
  };
  const errorMessage = errorType ? ERROR_MESSAGES[errorType] : undefined;

  return (
    <>
      <PageHero variant="minimal" title="ログイン" />

      <Container variant="narrow">
        <Stack gap="lg" className="mx-auto max-w-sm pb-[var(--spacing-block)]">
          {errorMessage != null && (
            <div
              className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          <p className="text-center text-muted-foreground">
            アカウントに連携して、予約の確認や変更が簡単にできます。
          </p>
          <SocialLoginButtons
            requiredTerms={requiredTerms.map((t) => ({
              id: t.id,
              slug: t.slug,
              title: t.title,
            }))}
          />
          {process.env["NODE_ENV"] !== "production" && <DevLoginButton />}
        </Stack>
      </Container>
    </>
  );
}
