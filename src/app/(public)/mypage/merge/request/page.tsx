/**
 * /mypage/merge/request — guest 履歴統合のリクエストページ。
 */

import type { ReactElement } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import {
  findUnlinkedGuestCustomerForMember,
  getCustomerMergePreviewForGuest,
} from "@/shared/domain/customers/customer-merge-commands";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { getAccountProviders } from "@/shared/domain/users/queries";
import {
  CUSTOMER_TRUSTED_PROVIDERS,
  getCustomerSession,
} from "@/shared/lib/customer-auth";
import { maskEmail } from "@/shared/lib/email/mask-email";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { RequestMergeForm } from "./_components/request-merge-form";

export const metadata: Metadata = {
  title: "履歴の統合",
  robots: { index: false, follow: false },
};

export default async function MergeRequestPage(): Promise<ReactElement> {
  await connection();

  const session = await getCustomerSession();
  if (!session) {
    redirect("/login?returnTo=/mypage/merge/request");
  }

  const providers = await getAccountProviders(session.user.id);
  const hasTrustedProvider = CUSTOMER_TRUSTED_PROVIDERS.some((provider) =>
    providers.includes(provider),
  );
  if (!hasTrustedProvider) {
    return (
      <PageLayout variant="form">
        <Stack gap="lg" className="mx-auto max-w-2xl">
          <Heading level={1}>履歴の統合</Heading>
          <div className="border border-border p-6 text-sm">
            <p>
              履歴の自己統合は、メールアドレスが検証済みの Google
              ログインでのみ利用できます。
            </p>
            <p className="mt-4">
              <Link href="/contact" className="underline underline-offset-4">
                お問い合わせ
              </Link>
              から運営へご連絡ください。
            </p>
          </div>
        </Stack>
      </PageLayout>
    );
  }

  const { customer } = await ensureCustomerLinked(session.user);
  if (!customer.email) {
    redirect("/mypage/settings?require_email=true");
  }

  const guest = await findUnlinkedGuestCustomerForMember({
    memberCustomerId: customer.id,
    email: customer.email,
  });
  if (!guest) {
    redirect(toAppRoute("/mypage"));
  }

  const preview = await getCustomerMergePreviewForGuest(guest.id);

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>履歴の統合</Heading>

        <div className="border border-border p-6 text-sm space-y-4">
          <p>
            ログイン前に作成された予約・お問い合わせ等の履歴を、現在の
            マイページアカウントへ統合します。本人確認のため、登録メールアドレス宛に
            確認 URL を送信します。
          </p>

          <div className="border border-border/60 bg-muted/30 p-4">
            <p className="font-medium">統合対象の履歴（概算）</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>予約: {preview.reservationCount.toString()} 件</li>
              <li>お問い合わせ: {preview.inquiryCount.toString()} 件</li>
              <li>レビュー: {preview.reviewCount.toString()} 件</li>
              <li>イベント参加: {preview.registrationCount.toString()} 件</li>
            </ul>
          </div>

          <RequestMergeForm maskedGuestEmail={maskEmail(guest.email)} />
        </div>
      </Stack>
    </PageLayout>
  );
}
