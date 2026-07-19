import type { ReactElement } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

import { Heading } from "@/public/components/design-system/heading";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Stack } from "@/public/components/design-system/stack";
import {
  getClientIpFromHeaders,
  publicQueryRateLimiter,
} from "@/shared/lib/rate-limit";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { toAppRoute } from "@/shared/lib/typed-routes";

import { ReceiptResendForm } from "./_components/receipt-resend-form";

/**
 * ゲスト向け領収書再送信リクエストページ (RECEIPT-RESEND-P1)。
 *
 * ## 対応ケース
 *  - Case B: 発行から 24 時間経過して署名 URL が TTL 超過した (usedAt=NULL)
 *  - Case C: 一度ダウンロード済で `Receipt.usedAt` が刻印された (single-use gate 消費)
 *
 * どちらもゲストは自力で /api/receipts/[serialNo]/pdf?token=... からは取得不能。
 * 本ページはフォームで serialNo + email を受け取り、一致した場合のみ
 * 新 token 付きの再送信メールを送る (Case B) or 訂正版 Receipt を発行して再送信する
 * (Case C)。enumeration 対策として match/mismatch に関わらず同一の完了画面を表示する。
 *
 * ## noindex
 * トークンゲート型 utility ページ (mypage / login と同方針)。検索結果に出さない。
 */
export const metadata: Metadata = {
  title: "領収書の再送信リクエスト",
  robots: { index: false, follow: false },
};

interface SearchParams {
  readonly serialNo?: string;
}

export default async function ReceiptReissueRequestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  await connection();

  const { serialNo } = await searchParams;

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return (
      <Layout>
        <div
          role="alert"
          className="border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
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

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <Layout>
      <p className="text-sm text-muted-foreground">
        発行時のメールに記載されている領収書番号と、ご登録のメールアドレスを入力してください。
        内容が一致した場合、ご登録メールアドレス宛に新しい 24
        時間有効なダウンロードリンクを送信します。
        すでにダウンロード済みの領収書については、訂正版（新しい番号）を発行して再送信します。
      </p>

      <div
        role="note"
        className="border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
      >
        領収書番号がわからない場合、または再送信メールが届かない場合は{" "}
        <Link
          href={toAppRoute("/contact")}
          className="underline underline-offset-4 hover:text-foreground"
        >
          お問い合わせ
        </Link>{" "}
        よりご連絡ください。
      </div>

      <ReceiptResendForm
        turnstileSiteKey={turnstileSiteKey}
        {...(serialNo !== undefined ? { initialSerialNo: serialNo } : {})}
      />
    </Layout>
  );
}

function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>領収書の再送信リクエスト</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}
