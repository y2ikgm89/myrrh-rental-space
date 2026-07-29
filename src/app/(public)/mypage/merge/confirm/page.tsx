/**
 * /mypage/merge/confirm — guest 履歴統合の確認ページ (HTTP-02)。
 */

import type { ReactElement } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import {
  validateCustomerMergeTokenCommand,
  type CustomerMergePreview,
} from "@/shared/domain/customers/customer-merge-commands";
import { DomainError } from "@/shared/domain/domain-error";
import {
  getClientIpFromHeaders,
  publicQueryRateLimiter,
} from "@/shared/lib/rate-limit";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { ConfirmMergeForm } from "./_components/confirm-merge-form";

export const metadata: Metadata = {
  title: "履歴統合の確認",
  robots: { index: false, follow: false },
};

type PageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MergeConfirmPage({
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
  const rawError = resolvedSearchParams["error"];
  const actionError = typeof rawError === "string" ? rawError : null;

  if (!token) {
    return <InvalidLinkView />;
  }

  let preview: CustomerMergePreview;
  try {
    preview = await validateCustomerMergeTokenCommand(token);
  } catch (error) {
    if (error instanceof DomainError) {
      return (
        <InvalidLinkView
          message={actionError ?? undefined}
          showRetry={actionError !== "rate_limit"}
        />
      );
    }
    throw error;
  }

  return (
    <Layout actionError={actionError}>
      <Stack gap="md">
        <div className="border border-border p-6">
          <Heading level={2} className="!text-xl">
            履歴統合の最終確認
          </Heading>
          <p className="mt-4 text-sm text-foreground">
            下記のボタンを押すと、ゲスト履歴が現在のマイページアカウントへ
            統合されます。リンクの有効期限は 1 時間です。
          </p>
        </div>

        <ConfirmMergeForm token={token} preview={preview} />
      </Stack>
    </Layout>
  );
}

function Layout({
  children,
  actionError,
}: {
  children: React.ReactNode;
  actionError?: string | null;
}) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>履歴統合の確認</Heading>
        {actionError !== null &&
        actionError !== undefined &&
        actionError.length > 0 ? (
          <div
            className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            {actionError === "rate_limit"
              ? "リクエストが多すぎます。しばらく経ってから再度お試しください。"
              : actionError}
          </div>
        ) : null}
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidLinkView({
  message,
  showRetry = true,
}: {
  message?: string | undefined;
  showRetry?: boolean;
}) {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          {message ?? "確認 URL が無効または期限切れです"}
        </p>
        {!message && (
          <p className="mt-2 text-sm text-muted-foreground">
            リンクが正しくないか、有効期限が切れている可能性があります。
          </p>
        )}
        {showRetry ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Link
              href={toAppRoute("/mypage/merge/request")}
              className="underline underline-offset-4 hover:text-foreground"
            >
              履歴統合リクエスト
            </Link>
            から再度お試しください。
          </p>
        ) : null}
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
