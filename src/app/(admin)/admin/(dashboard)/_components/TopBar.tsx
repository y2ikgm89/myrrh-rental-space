"use client";

/**
 * TopBar
 *
 * モバイル用トップバー
 * ハンバーガーボタンでサイドバーを開閉
 * ブランディング表示（ロゴ/サイト名）対応
 */

import { useRef } from "react";
import { IconExternalLink, IconMenu2 } from "@tabler/icons-react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { Button } from "@/admin/components/ui";
import { Z_INDEX, adminZIndexClassName } from "@/admin/lib/styles/z-index";
import { useAdminZIndexImperative } from "@/admin/lib/styles/use-admin-z-index-layer";
import { getBaseUrl } from "@/shared/lib/constants/urls";
import { LogoutButton } from "./LogoutButton";
import type { ReactNode } from "react";

type TopBarProps = {
  branding: ReactNode;
  notifications: ReactNode;
  searchTrigger?: ReactNode;
};

export function TopBar({
  branding,
  notifications,
  searchTrigger,
}: TopBarProps) {
  const { toggleSidebar, sidebarState, isMobile, isFullscreen, hasMounted } =
    useAdminLayout();

  const headerRef = useRef<HTMLElement>(null);
  useAdminZIndexImperative(headerRef, Z_INDEX.header);

  // フルスクリーンモード時はヘッダーを非表示
  if (isFullscreen) return null;

  // Hydration対策: マウント前はSSR時と同じ値（isMobile=false）を使用
  const showMobileMenu = hasMounted && isMobile;
  const isSidebarExpanded = sidebarState === "expanded";
  const publicSiteUrl = getBaseUrl();

  return (
    <header
      ref={headerRef}
      className={cn(
        "sticky top-0 flex h-16 items-center justify-between border-b bg-card px-4 shadow-sm lg:px-6",
        adminZIndexClassName(),
      )}
    >
      {/* 左: ハンバーガー + ブランディング */}
      <div className="flex items-center gap-3">
        {showMobileMenu && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label={
              isSidebarExpanded ? "メニューを閉じる" : "メニューを開く"
            }
            aria-controls="admin-sidebar"
            aria-expanded={isSidebarExpanded}
          >
            <IconMenu2 className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}
        <Link href="/admin" className="flex min-h-11 items-center">
          {branding}
        </Link>
        {searchTrigger}
      </div>

      {/* 右: アクション */}
      <div className="flex items-center gap-4">
        {notifications}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
        >
          <a
            href={publicSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="公開サイトを別タブで開く"
          >
            <IconExternalLink aria-hidden="true" />
            <span>公開サイトを開く</span>
          </a>
        </Button>
        <LogoutButton />
      </div>
    </header>
  );
}
