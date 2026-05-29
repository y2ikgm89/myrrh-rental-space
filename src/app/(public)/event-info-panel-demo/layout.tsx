import type { Metadata } from "next";
import type { ReactNode } from "react";

// UI デザイン探索ページ（implementation-patterns.md §UI デザイン探索）。
// 本番 SEO 汚染防止のため検索インデックス対象外にする。
export const metadata: Metadata = {
  title: "イベント情報パネル デザイン比較",
  robots: { index: false, follow: false },
};

export default function EventInfoPanelDemoLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
