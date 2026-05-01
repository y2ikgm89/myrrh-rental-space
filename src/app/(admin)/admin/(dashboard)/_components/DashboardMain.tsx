"use client";

import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";

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

type DashboardMainProps = {
  children: ReactNode;
};

export function DashboardMain({ children }: DashboardMainProps) {
  const { isFullscreen } = useAdminLayout();
  return <main className={mainStyles({ isFullscreen })}>{children}</main>;
}
