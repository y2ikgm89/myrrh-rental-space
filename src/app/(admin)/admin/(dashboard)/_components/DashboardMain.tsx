"use client";

import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";

// @container/main — named container query context
// children（dashboard / list / detail ページ）が @*/main variant で
// サイドバー折りたたみに応じたレイアウト適応が可能（Tailwind v4 公式推奨）
const mainStyles = tv({
  base: "@container/main min-h-[calc(100dvh-4rem)] bg-background",
  variants: {
    isFullscreen: {
      true: "",
      false: "p-4 lg:p-6",
    },
  },
});

type DashboardMainProps = {
  children: ReactNode;
};

/**
 * `id="main-content"` は WCAG 2.4.1 bypass-blocks の SSoT anchor。
 * dashboard/layout.tsx が最上段に描画する `SkipToMainContentLink` の
 * `href="#main-content"` と対応する。tabIndex={-1} は focus() 経由の
 * ジャンプでフォーカスを主コンテンツに置くために必要 (nav 内 Tab を
 * 何十回も押さずに済ませるためのキーボードユーザー向け bypass)。
 */
export function DashboardMain({ children }: DashboardMainProps) {
  const { isFullscreen } = useAdminLayout();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={mainStyles({ isFullscreen })}
    >
      {children}
    </main>
  );
}
