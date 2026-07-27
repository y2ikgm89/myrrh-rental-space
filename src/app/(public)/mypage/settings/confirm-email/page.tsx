/**
 * /mypage/settings/confirm-email — メールアドレス本人確認の確認ページ (HTTP-02)。
 *
 * メール本文リンクの着地先。read-only で token を検証し、ユーザーが
 * 「メールアドレスを登録する」ボタンを押した POST のみが token を消費する。
 */

import type { ReactElement } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { validateCustomerEmailChangeTokenCommand } from "@/shared/domain/customers/customer-email-change-commands";
import { DomainError } from "@/shared/domain/domain-error";
import {
  getClientIpFromHeaders,
  publicQueryRateLimiter,
} from "@/shared/lib/rate-limit";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { ConfirmEmailForm } from "./_components/confirm-email-form";

export const metadata: Metadata = {
  title: "メールアドレスの確認",
  robots: { index: false, follow: false },
};

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmEmailPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <TooManyRequestsView />;
  }

  const resolvedSearchParams = await searchParams;
  const rawToken = resolvedSearchParams["token"];
  const token = typeof rawToken === "string" ? rawToken : null;

  if (!token) {
    return <InvalidLinkView />;
  }

  try {
    await validateCustomerEmailChangeTokenCommand(token);
  } catch (error) {
    if (error instanceof DomainError) {
      return <InvalidLinkView />;
    }
    throw error;
  }

  return (
    <Layout>
      <Stack gap="md">
        <div className="border border-border p-6">
          <Heading level={2} className="!text-xl">
            メールアドレスの登録確認
          </Heading>
          <p className="mt-4 text-sm text-foreground">
            下記のボタンを押すと、入力されたメールアドレスがアカウントに登録されます。
            リンクの有効期限は 1 時間です。
          </p>
        </div>

        <ConfirmEmailForm token={token} />
      </Stack>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>メールアドレスの確認</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidLinkView() {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          確認 URL が無効または期限切れです
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが正しくないか、有効期限が切れている可能性があります。
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link
            href={toAppRoute("/mypage/settings")}
            className="underline underline-offset-4 hover:text-foreground"
          >
            アカウント設定
          </Link>
          から再度メールアドレスを入力してください。
        </p>
      </div>
    </Layout>
  );
}

function TooManyRequestsView() {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リクエストが多すぎます
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          しばらく時間をおいてから再度お試しください。
        </p>
      </div>
    </Layout>
  );
}
