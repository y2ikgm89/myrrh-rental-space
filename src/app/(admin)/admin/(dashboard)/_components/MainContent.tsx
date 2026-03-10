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

const mainStyles = tv({
  base: "min-h-[calc(100vh-4rem)] bg-background",
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
