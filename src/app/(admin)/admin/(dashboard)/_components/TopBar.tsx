"use client";

/**
 * TopBar
 *
 * モバイル用トップバー
 * ハンバーガーボタンでサイドバーを開閉
 * ブランディング表示（ロゴ/サイト名）対応
 */

import { IconExternalLink, IconMenu2 } from "@tabler/icons-react";
import Link from "next/link";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { Button } from "@/admin/components/ui";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
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

  // フルスクリーンモード時はヘッダーを非表示
  if (isFullscreen) return null;

  // Hydration対策: マウント前はSSR時と同じ値（isMobile=false）を使用
  const showMobileMenu = hasMounted && isMobile;
  const isSidebarExpanded = sidebarState === "expanded";
  const publicSiteUrl = getBaseUrl();

  return (
    <header
      className="sticky top-0 flex h-16 items-center justify-between border-b bg-card px-4 shadow-sm lg:px-6"
      style={{ zIndex: Z_INDEX.header }}
    >
      {/* 左: ハンバーガー + ブランディング */}
      <div className="flex items-center gap-3">
        {showMobileMenu && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="メニューを開く"
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
