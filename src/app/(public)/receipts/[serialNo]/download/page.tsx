import type { ReactElement } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { verifyReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { receiptDownloadNow } from "@/shared/domain/receipts/server-download-instant";
import {
  getClientIpFromHeaders,
  publicQueryRateLimiter,
} from "@/shared/lib/rate-limit";
import { toAppRoute } from "@/shared/lib/typed-routes";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { DownloadReceiptForm } from "./_components/download-form";

// トークンゲートのユーティリティページ。検索結果に出さない
// (reservation/cancel / events/cancel と同方針)。
export const metadata: Metadata = {
  title: "領収書ダウンロード",
  robots: { index: false, follow: false },
};

type PageProps = {
  readonly params: Promise<{ serialNo: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * ゲスト向け領収書 PDF ダウンロード確認ページ (HTTP-02)。
 *
 * ## 経路
 * メール本文の署名 URL (`/receipts/[serialNo]/download?token=<sig>`) が着地する。
 * 本ページ自身は **read-only** で `Receipt.usedAt` を触らない。ユーザーが
 * 「領収書 PDF をダウンロードする」ボタンを押すと `<form method="POST">` が
 * `/api/receipts/[serialNo]/pdf` を叩き、そこで single-use claim + PDF 返却が起きる。
 *
 * ## HTTP-02 (link scanner 対策) の設計理由
 * 旧: メール本文リンクが `/api/receipts/[serialNo]/pdf?token=<sig>` に直接繋がっており、
 * Outlook SafeLinks / Gmail preview / Slack unfurl / iMessage / Discord embed 等の
 * link scanner の GET プリフェッチで `usedAt` が消費され、ゲスト本人のクリック時に
 * 404 になっていた (実質的に全ゲストが領収書を受け取れない fail mode)。
 *
 * 新: メール本文リンクを本 confirm page (副作用ゼロ) に着地させ、実 claim は
 * ユーザーの明示的なボタン押下による POST に切り分ける。RFC 9110 の safe-method
 * 契約により、link scanner は unsafe method (POST) をプリフェッチしない。
 *
 * ## 動的化 (cacheComponents:true)
 * 冒頭 `await connection()` で完全動的化 (route segment config は禁止)。
 */
export default async function ReceiptDownloadConfirmPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const [{ serialNo }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  // GET ページにも rate-limit を貼る (reservation/cancel と同方針)。
  // 有効トークン 1 本で verify を無制限ヒットできる経路を遮断
  // (publicQueryRateLimiter: 30/min/IP)。
  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <TooManyRequestsView />;
  }

  const rawToken = resolvedSearchParams["token"];
  const token = typeof rawToken === "string" ? rawToken : null;

  if (!token) {
    return <InvalidLinkView />;
  }

  const verified = verifyReceiptDownloadToken(token, receiptDownloadNow());
  if (!verified.valid) {
    // WARNING ログ: 失敗 token の流通量を観測する
    // (reservation/cancel と同方針)。tokenFingerprint 相当の詳細情報は
    // 領収書 token 側に helper が無いためここでは記録しない (必要になれば追加)。
    logError(new Error("Receipt download token verify failed"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "receiptDownloadConfirmPageVerify",
        ip: clientIp,
        serialNo,
      },
    });
    return <InvalidLinkView />;
  }

  // URL の serialNo と token 内 serialNo の突合。route handler 側の POST でも
  // 同じ突合を再度行う (defense-in-depth、confirm page → POST の間に serialNo が
  // 差し替えられるケースを構造的に閉じる)。
  if (verified.serialNo !== serialNo) {
    return <InvalidLinkView />;
  }

  return (
    <Layout>
      <Stack gap="md">
        <div className="border border-border p-6">
          <Heading level={2} className="!text-xl">
            領収書 (適格請求書) のダウンロード
          </Heading>
          <p className="mt-2 text-sm text-muted-foreground">
            領収書番号: {serialNo}
          </p>
          <p className="mt-4 text-sm text-foreground">
            下記のボタンから領収書 PDF をダウンロードいただけます (24
            時間有効・1 回のみ)。ダウンロード後は大切に保管してください。
          </p>
        </div>

        <DownloadReceiptForm serialNo={serialNo} token={token} />
      </Stack>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>領収書ダウンロード</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

/**
 * **意図的に invalid と expired を同一文言に統合**: 期限切れ表示で「これは正規
 * トークン形式」という弱オラクル情報を漏らさない (reservation/cancel と同方針)。
 *
 * 領収書 token の TTL は 24 時間。既に DL 済み (usedAt !== null) のケースは
 * POST 側で 404 になり、ここには到達しない (confirm page は Receipt を触らないため)。
 */
function InvalidLinkView() {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          ダウンロードリンクが無効または期限切れです
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクが正しくないか、有効期限が切れている可能性があります。
        </p>
        <Stack gap="sm" className="mt-4 text-sm text-muted-foreground">
          <p>
            会員の方は
            <Link
              href={toAppRoute("/mypage")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              マイページ
            </Link>
            から領収書をダウンロードできます。
          </p>
          <p>
            領収書の再発行をご希望の場合は
            <Link
              href={toAppRoute("/contact")}
              className="underline underline-offset-4 hover:text-foreground"
              rel="noreferrer"
            >
              お問い合わせ
            </Link>
            よりご連絡ください。
          </p>
        </Stack>
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
