import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { isCustomerE2ELoginEnabled } from "@/shared/lib/e2e-runtime";
import { LoginHero } from "./_components/login-hero";
import { SocialLoginButtons } from "./_components/social-login-buttons";
import { DevLoginButton } from "./_components/dev-login-button";
import { SuspendedNotice } from "./_components/suspended-notice";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

/**
 * `redirect` クエリパラメータが同一オリジン内の相対パスであることを確認する。
 * open redirect 防止のため `//`（protocol-relative）・`scheme://`・`..` セグメントを拒否する。
 */
function isSafeInternalRedirect(path: string | null): path is string {
  if (path === null) return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.split("/").includes("..")) return false;
  } catch {
    return false;
  }
  return true;
}

const ERROR_MESSAGES: Record<string, string> = {
  account_suspended:
    "アカウントが停止されています。詳細はお問い合わせください。",
  auth_failed: "認証に失敗しました。もう一度お試しください。",
};

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  await connection();

  const params = await searchParams;
  const errorType =
    typeof params["error"] === "string" ? params["error"] : null;
  const rawRedirect =
    typeof params["redirect"] === "string" ? params["redirect"] : null;
  const callbackURL = isSafeInternalRedirect(rawRedirect)
    ? rawRedirect
    : undefined;

  const user = await getCurrentCustomerUser();

  // MYPAGE-AUTH-01: MypageAuthGate が Customer.isActive=false を検知した際、
  // Server Component からは Better Auth session cookie を破棄できないため、
  // /login?error=account_suspended へ redirect してくる。ここで無条件に
  // `if (user) redirect('/mypage')` を実行すると MypageAuthGate → LoginPage の
  // 無限リダイレクトループ (ERR_TOO_MANY_REDIRECTS) が発生する。
  //
  // account_suspended エラーが提示された場合は redirect を止め、SuspendedNotice
  // に配線した Server Action ログアウトボタンを表示してユーザーに明示的なセッション
  // 破棄経路を提供する。それ以外の error クエリ (例: auth_failed) や error クエリ
  // なしのケースでは、ログイン済みユーザーは従来どおり /mypage へリダイレクトする。
  if (user && errorType !== "account_suspended") redirect("/mypage");

  const [requiredTerms, turnstileSiteKey] = await Promise.all([
    getRequiredTermsByScope(TermsScope.LOGIN_SIGNUP),
    getTurnstileSiteKey(),
  ]);

  const errorMessage = errorType ? ERROR_MESSAGES[errorType] : undefined;
  const showSuspendedNotice =
    user !== null && errorType === "account_suspended" && errorMessage != null;

  return (
    <>
      <LoginHero />

      <Container variant="narrow">
        <Stack gap="lg" className="mx-auto max-w-sm pb-[var(--spacing-region)]">
          {showSuspendedNotice ? (
            <SuspendedNotice message={errorMessage} />
          ) : (
            <>
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
                turnstileSiteKey={turnstileSiteKey}
                {...(callbackURL !== undefined ? { callbackURL } : {})}
              />
              {(process.env["NODE_ENV"] !== "production" ||
                isCustomerE2ELoginEnabled()) && <DevLoginButton />}
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}
