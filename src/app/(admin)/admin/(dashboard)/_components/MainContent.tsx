"use client";

/**
 * MainContent
 *
 * ダッシュボードのメインコンテンツエリア
 * - TopBarはmainの外（wrapperの直接の子）に配置
 * - フルスクリーンモード時はサイドバーの左パディングとmainのパディングを除去
 */

import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";

const wrapperStyles = tv({
  variants: {
    isFullscreen: {
      true: "",
      false: "lg:pl-64",
    },
  },
});

// @container/main — named container query context
// children（dashboard / list / detail ページ）が @*/main variant で
// サイドバー折りたたみに応じたレイアウト適応が可能（Tailwind v4 公式推奨）
const mainStyles = tv({
  base: "@container/main min-h-[calc(100vh-4rem)] bg-background",
  variants: {
    isFullscreen: {
      true: "",
      false: "p-4 lg:p-6",
    },
  },
});

type MainContentProps = {
  /** TopBar（mainの外に配置） */
  topBar?: ReactNode;
  /** メインコンテンツ */
  children: ReactNode;
};

export function MainContent({ topBar, children }: MainContentProps) {
  const { isFullscreen } = useAdminLayout();

  return (
    <div className={wrapperStyles({ isFullscreen })}>
      {topBar}
      <main className={mainStyles({ isFullscreen })}>{children}</main>
    </div>
  );
}
