import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

// トークンゲート系ページの兄弟。404 ではなく informational landing のため noindex のみ。
export const metadata: Metadata = {
  title: "繰り上げ当選の期限切れ",
  robots: { index: false, follow: false },
};

/**
 * イベント waitlist 繰り上げ当選の期限切れ landing（soft page、404 ではない）。
 *
 * confirm page / checkout route の両方から、token が無効・期限切れ・
 * WAITLISTED_OFFERED 以外の場合にリダイレクトされる着地先。
 * token を扱わないため DB アクセス無し、rate limit 不要。
 */
export default async function WaitlistExpiredPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>繰り上げ当選の期限切れ</Heading>
        <div className="border border-border p-6 text-center">
          <p className="text-base font-medium text-foreground">
            この繰り上げ当選のご案内は期限が切れています
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            確定期限を過ぎたため、この繰り上げ当選は無効になりました。
            お手数ですが、改めてキャンセル待ちにご登録ください。
          </p>
          <p className="mt-6 text-sm">
            <Link
              href="/events"
              className="underline underline-offset-4 hover:text-foreground"
            >
              イベント一覧を見る
            </Link>
          </p>
        </div>
      </Stack>
    </PageLayout>
  );
}
