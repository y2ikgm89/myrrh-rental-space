/**
 * 管理画面 Root IconLayout
 *
 * Next.js 16 Multiple Root Layouts パターン
 * - 公開ページとは完全に分離された独立したRoot IconLayout
 * - admin.css で管理画面専用テーマを適用
 * - 公開ページ ↔ 管理画面の遷移はフルページリロード（仕様）
 */

import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import type { ReactElement, ReactNode } from "react";
import { getAppUrl } from "@/shared/lib/constants";
import "./_styles/admin.css";

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "管理画面",
    template: "%s | 管理画面",
  },
  robots: {
    index: false,
    follow: false,
  },
};

// nonce CSP(strict-dynamic) + PPR(cacheComponents) では route を完全動的(ƒ)に
// しないと document 直下の framework/chunk スクリプトに per-request nonce が付かず
// CSP で全ブロックされる（◐ 静的シェルでは nonce 不在＝管理画面の JS が一切起動しない）。
// head 生成(generateViewport)で connection() を呼び admin route を ƒ 化する。layout の
// component 本体で connection() を呼ぶと、子ページの uncached read が cacheComponents の
// "blocking route" でビルドを落とすため、副作用のない head 生成側で動的化する
// （公開側も layout の generateViewport / page の generateMetadata が動的）。
export async function generateViewport(): Promise<Viewport> {
  await connection();
  return {
    width: "device-width",
    initialScale: 1,
    interactiveWidget: "resizes-visual",
    colorScheme: "light",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#2563eb" },
      { media: "(prefers-color-scheme: dark)", color: "#1e40af" },
    ],
  };
}

export default async function AdminRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  // generateViewport が connection()（Request データ）に依存することで、この root layout
  // 配下の admin route を「完全動的(ƒ)」にする。完全動的化には document(<html>) を
  // <Suspense> で包む必要がある（Next.js 公式 next-prerender-dynamic-viewport の opt-in）。
  // ƒ にすることで静的シェルが無くなり、framework/chunk スクリプト全てに per-request
  // nonce が付与され、strict-dynamic CSP でブロックされなくなる。
  return (
    <Suspense>
      <html lang="ja">
        <body className="font-sans antialiased">{children}</body>
      </html>
    </Suspense>
  );
}
