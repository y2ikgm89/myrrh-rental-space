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
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { IconX } from "@tabler/icons-react";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { Button } from "@/admin/components/ui";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import type { SidebarGroup } from "@/admin/types/admin-layout";

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
    navGroup: "space-y-1",
    navGroupHeading: [
      // Swiss Industrial: uppercase + wide tracking でセクション見出しを表現
      // heading 階層を汚さないため <p aria-hidden>。SR は <ul aria-label> 経由で識別
      "px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-sidebar-text-muted",
    ],
    navItem: [
      "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sidebar-text-muted cursor-pointer",
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

function isSidebarItemActive(
  itemHref: string,
  pathname: string,
  currentParams: URLSearchParams,
): boolean {
  const [itemPath, itemQuery = ""] = itemHref.split("?");
  if (itemPath === undefined) return false;

  const pathMatches =
    pathname === itemPath ||
    (itemPath !== "/admin" && pathname.startsWith(`${itemPath}/`));

  if (!pathMatches) return false;

  if (!itemQuery) {
    // Bare path: active only if the URL has no `tab` param
    // (prevents "スペース管理" highlighting when viewing the reviews tab)
    return !currentParams.has("tab");
  }

  // Query-bearing item: every key in item's query must match current URL
  const itemQueryParams = new URLSearchParams(itemQuery);
  for (const [key, value] of itemQueryParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

type ResponsiveSidebarProps = {
  groups: SidebarGroup[];
  userInfo: ReactNode;
};

export function ResponsiveSidebar({
  groups,
  userInfo,
}: ResponsiveSidebarProps) {
  const { sidebarState, closeSidebar, isMobile, isFullscreen, hasMounted } =
    useAdminLayout();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
        style={{
          zIndex: effectiveIsMobile ? Z_INDEX.sidebarDrawer : Z_INDEX.sidebar,
        }}
        aria-label="メインナビゲーション"
      >
        {/* 閉じるボタン (モバイル) */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={closeSidebar}
          className={classes.closeButton()}
          aria-label="メニューを閉じる"
        >
          <IconX className="h-5 w-5" aria-hidden="true" />
        </Button>

        {/* ロゴ */}
        <div className={classes.logo()}>
          <Link href="/admin" className="inline-flex min-h-11 items-center">
            管理画面
          </Link>
        </div>

        {/* ナビゲーション */}
        <nav className={classes.nav()}>
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className={classes.navGroupHeading()} aria-hidden="true">
                  {group.label}
                </p>
                <ul className={classes.navGroup()} aria-label={group.label}>
                  {group.items.map((item) => {
                    const isActive = isSidebarItemActive(
                      item.href,
                      pathname,
                      searchParams,
                    );
                    return (
                      <li key={item.href}>
                        <Link
                          href={toAppRoute(item.href)}
                          className={cn(
                            classes.navItem(),
                            isActive && classes.navItemActive(),
                          )}
                          onClick={() => effectiveIsMobile && closeSidebar()}
                        >
                          <span className={isActive ? "text-sidebar-text" : ""}>
                            {item.icon}
                          </span>
                          <span
                            className={cn(
                              "text-sm font-medium",
                              isActive && "text-sidebar-text",
                            )}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* ユーザー情報 */}
        <div className={classes.userSection()}>{userInfo}</div>
      </aside>
    </>
  );
}
