/**
 * グローバル404ページ
 *
 * Multiple Root Layouts パターンのため app/layout.tsx が存在しない。
 * html/body タグを自前で含める必要がある。
 * Server Component なので CSS import と next/font/google が使用可能
 * （global-error.tsx は "use client" 必須のためインラインスタイル）。
 *
 * 公開ページの訪問者が 404 に遭遇するケースが大半のため
 * public.css テーマを適用する。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Cormorant_Garamond, Noto_Sans_JP } from "next/font/google";
import "./(public)/_styles/public.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "ページが見つかりません",
  description: "お探しのページは存在しないか、移動した可能性があります。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound(): ReactElement {
  return (
    <html lang="ja">
      <body
        className={`${notoSansJP.variable} ${cormorantGaramond.variable} font-sans antialiased`}
      >
        <div className="flex min-h-screen flex-col items-center justify-center px-5 md:px-8">
          <div className="w-full max-w-md text-center">
            <div className="mb-8">
              <span className="font-heading text-8xl font-bold text-border">
                404
              </span>
            </div>

            <h1 className="mb-3 font-heading text-2xl font-bold tracking-tight text-foreground">
              ページが見つかりません
            </h1>

            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              お探しのページは存在しないか、
              <br />
              移動した可能性があります。
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {/* Root レベルでは Router コンテキストがないため a タグを使用 */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="rounded-full border border-accent bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                ホームに戻る
              </a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/spaces"
                className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                スペース一覧を見る
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
