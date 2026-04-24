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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-visual",
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#1e40af" },
  ],
};

export default async function AdminRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
