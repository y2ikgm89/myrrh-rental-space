/**
 * 管理画面 Root IconLayout
 *
 * Next.js 16 Multiple Root Layouts パターン
 * - 公開ページとは完全に分離された独立したRoot IconLayout
 * - admin.css で管理画面専用テーマを適用
 * - 公開ページ ↔ 管理画面の遷移はフルページリロード（仕様）
 */

import type { Metadata, Viewport } from "next";
import type { ReactElement, ReactNode } from "react";
import { Noto_Sans_JP } from "next/font/google";
import "./_styles/admin.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "管理画面",
    template: "%s | 管理画面",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function AdminRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
