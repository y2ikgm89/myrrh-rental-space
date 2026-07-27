"use client";

/**
 * Mobile Bottom Navigation — モバイルのみ表示される固定ナビゲーション
 *
 * 認証 kind は hydrate 後に `/api/customer/auth-kind` で解決する
 * （`useSession` を使わず Better Auth クライアントを全公開ページから除去し、
 * かつ CDN キャッシュ HTML に login/mypage を埋め込まない）。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendarCheck,
  IconHome,
  IconLayoutGrid,
  IconLogin,
  IconUser,
  type TablerIcon,
} from "@tabler/icons-react";
import type { Route } from "next";
import { cn } from "@/shared/lib/cn";
import { normalizePreviewPathname } from "@/shared/lib/preview-routes";
import { usePublicAuthKind } from "@/public/hooks/use-public-auth-kind";
import type { PublicAuthKind } from "@/shared/lib/public-auth-kind";

interface NavItem {
  readonly href: Route;
  readonly icon: TablerIcon;
  readonly label: string;
  /** exact `/` 以外の判定を startsWith で行う */
  readonly exact?: boolean;
}

const STATIC_NAV_ITEMS: readonly NavItem[] = [
  { href: "/", icon: IconHome, label: "ホーム", exact: true },
  { href: "/spaces", icon: IconLayoutGrid, label: "スペース" },
  { href: "/reservation", icon: IconCalendarCheck, label: "予約" },
];

const AUTH_NAV_ITEMS = {
  mypage: { href: "/mypage", icon: IconUser, label: "マイページ" },
  login: { href: "/login", icon: IconLogin, label: "ログイン" },
} as const satisfies Record<Exclude<PublicAuthKind, null>, NavItem>;

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function MobileNav() {
  // preview URL (`/preview/posts/[id]` 等) は本番 URL (`/blog` 等) に正規化して
  // active 判定する。preview と本番で同じタブが選択状態として表示される。
  const pathname = normalizePreviewPathname(usePathname());
  const { status: authStatus, kind: authKind } = usePublicAuthKind();
  const authItem =
    authStatus === "ready" && authKind ? AUTH_NAV_ITEMS[authKind] : null;
  const showAuthSkeleton = authStatus === "loading";
  const items: readonly NavItem[] = authItem
    ? [...STATIC_NAV_ITEMS, authItem]
    : STATIC_NAV_ITEMS;

  return (
    <nav
      aria-label="モバイルナビゲーション"
      // edge-to-edge: 背景は画面下端まで、操作項目はホームインジケータ帯を避ける。
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="flex items-center justify-around py-2">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-3 py-1 text-xs transition-colors focus-visible:bg-surface focus-visible:text-foreground",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        {showAuthSkeleton && (
          <li aria-hidden="true" data-auth-chrome="skeleton">
            <div className="flex min-h-11 flex-col items-center justify-center gap-0.5 px-3 py-1">
              <div className="h-5 w-5 animate-pulse rounded-sm bg-surface" />
              <div className="h-3 w-10 animate-pulse bg-surface" />
            </div>
          </li>
        )}
      </ul>
    </nav>
  );
}
