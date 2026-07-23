import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { getBusinessInfo } from "@/public/data/business";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

export const metadata: Metadata = {
  title: "イベント申込のお支払いについて",
  robots: { index: false, follow: false },
};

export default async function EventRegistrationCheckoutErrorPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  const { email: contactEmail } = await getBusinessInfo();

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-xl py-12 text-center">
        <Heading level={1}>お支払いを開始できませんでした</Heading>
        <p className="text-muted-foreground">
          リンクの有効期限切れ、既に決済済み、または一時的なエラーの可能性があります。
          確認メールのリンクを再度お試しいただくか、
          {contactEmail ? (
            <>
              {" "}
              <a
                href={`mailto:${contactEmail}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {contactEmail}
              </a>{" "}
              までお問い合わせください。
            </>
          ) : (
            " お問い合わせ窓口までご連絡ください。"
          )}
        </p>
        <Link
          href="/events"
          className="inline-flex min-h-11 items-center justify-center text-foreground underline decoration-border underline-offset-4"
        >
          イベント一覧へ戻る
        </Link>
      </Stack>
    </PageLayout>
  );
}
