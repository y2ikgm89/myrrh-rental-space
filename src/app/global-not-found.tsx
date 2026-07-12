/**
 * グローバル404ページ（Multiple Root Layouts 専用）
 *
 * Next.js 16: Multiple Root Layouts 環境では `app/not-found.tsx` を使うと
 * Next.js が内部 DefaultLayout で描画するため hydration mismatch が発生する。
 * 公式解決策は `app/global-not-found.tsx` + `experimental.globalNotFound: true`。
 *
 * ルート内部（例: /spaces/xxx）の 404 は各 Route Group 内の
 * `(public)/not-found.tsx` や `(admin)/admin/(dashboard)/not-found.tsx` が担当し、
 * 当該 Root Layout 配下で描画される。
 *
 * このファイルは全く未マッチの URL（ルーティング外）にのみ使われ、
 * html/body タグを自前で持ち Root Layout をバイパスする。
 * 公開ページの訪問者が 404 に遭遇するケースが大半のため public.css を適用する。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/not-found#global-not-foundjs
 */

import type { Metadata, Viewport } from "next";
import type { ReactElement } from "react";
import "./(public)/_styles/public.css";

export const metadata: Metadata = {
  title: "ページが見つかりません",
  description: "お探しのページは存在しないか、移動した可能性があります。",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * `(public)/layout.tsx` の generateViewport が返している `colorScheme: "only light"`
 * (Chrome Auto Dark Theme / Samsung Internet 強制ダークの opt-out) を継承する
 * ルートが無いため、ここで明示する。global-not-found は Root Layout を完全に
 * バイパスして自前 `<html>` を描画する仕様のため viewport export が必要。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata#viewport-object
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "only light",
};

export default function NotFound(): ReactElement {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center px-5 md:px-8">
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
                className="border border-accent bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                ホームに戻る
              </a>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/spaces"
                className="border border-border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
