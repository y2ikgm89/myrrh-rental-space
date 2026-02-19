"use client";

/**
 * ResponsiveSidebar
 *
 * レスポンシブ対応サイドバー
 * - デスクトップ: 固定表示 (w-64)
 * - モバイル: ドロワー (スライドイン)
 */

import { useEffect, useEffectEvent } from "react";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { Button } from "@/admin/components/ui";
import { SIDEBAR_ITEMS } from "./sidebar-items";
import { Z_INDEX } from "@/admin/lib/styles/z-index";

const styles = tv({
  slots: {
    overlay: [
      "fixed inset-0 bg-overlay backdrop-blur-sm transition-opacity duration-300",
      "lg:hidden",
    ],
    sidebar: [
      // Swiss Industrial: ダークで洗練されたサイドバー
      "fixed inset-y-0 left-0 bg-sidebar-bg text-sidebar-text transition-transform duration-300 ease-out",
      "flex flex-col w-64",
      // 右端に微細なハイライトライン
      "border-r border-sidebar-border",
    ],
    logo: [
      "flex h-14 items-center justify-center border-b border-sidebar-border",
      // Swiss Typography: クリーンなロゴ
      "text-lg font-semibold tracking-tight",
    ],
    nav: "flex-1 overflow-y-auto px-3 py-4",
    navItem: [
      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sidebar-text-muted cursor-pointer",
      "transition-all duration-200 ease-out",
      "hover:bg-sidebar-nav-hover hover:text-sidebar-text",
    ],
    navItemActive: [
      // アクティブ状態: プライマリカラーのアクセント
      "bg-sidebar-accent text-primary-foreground",
      "hover:bg-sidebar-accent/90",
      // 左端にアクセントバー
      "relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
      "before:w-0.5 before:h-4 before:bg-primary-foreground before:rounded-full",
    ],
    closeButton:
      "absolute right-3 top-3 lg:hidden text-sidebar-text-muted hover:text-sidebar-text",
    userSection: "border-t border-sidebar-border p-4",
  },
  variants: {
    isOpen: {
      true: {
        overlay: "opacity-100",
        sidebar: "translate-x-0",
      },
      false: {
        overlay: "opacity-0 pointer-events-none",
        sidebar: "-translate-x-full lg:translate-x-0",
      },
    },
  },
});

type ResponsiveSidebarProps = {
  userInfo: ReactNode;
};

export function ResponsiveSidebar({ userInfo }: ResponsiveSidebarProps) {
  const { sidebarState, closeSidebar, isMobile, isFullscreen, hasMounted } =
    useAdminLayout();
  const pathname = usePathname();
  // Hydration対策: マウント前はSSR時と同じ値を使用
  // SSR時: sidebarState='expanded', isMobile=false → isOpen=true
  const isOpen = hasMounted ? sidebarState === "expanded" : true;
  const effectiveIsMobile = hasMounted && isMobile;
  const classes = styles({ isOpen });

  // ESCキーで閉じる（useEffectEvent: closeSidebarをdeps配列から除外）
  const onEscKey = useEffectEvent(() => {
    closeSidebar();
  });
  useEffect(() => {
    if (!effectiveIsMobile || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscKey();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [effectiveIsMobile, isOpen]);

  // スクロール禁止
  useEffect(() => {
    if (effectiveIsMobile && isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [effectiveIsMobile, isOpen]);

  // フルスクリーンモード時はレンダリングしない（Lexicalエディタ等）
  if (isFullscreen) return null;

  return (
    <>
      {/* オーバーレイ (モバイル) */}
      <div
        className={classes.overlay()}
        style={{ zIndex: Z_INDEX.overlay }}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* サイドバー */}
      <aside
        className={classes.sidebar()}
        style={{ zIndex: Z_INDEX.sidebar }}
        aria-label="メインナビゲーション"
      >
        {/* 閉じるボタン (モバイル) */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeSidebar}
          className={classes.closeButton()}
          aria-label="メニューを閉じる"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* ロゴ */}
        <div className={classes.logo()}>
          <Link href="/admin">管理画面</Link>
        </div>

        {/* ナビゲーション */}
        <nav className={classes.nav()}>
          <ul className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin" &&
                  pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${classes.navItem()} ${isActive ? classes.navItemActive() : ""}`}
                    onClick={() => effectiveIsMobile && closeSidebar()}
                  >
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ユーザー情報 */}
        <div className={classes.userSection()}>{userInfo}</div>
      </aside>
    </>
  );
}
