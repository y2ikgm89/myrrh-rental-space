"use client";

/**
 * Site Header — Radix NavigationMenu + Radix Dialog (mobile)
 *
 * - デスクトップ: @radix-ui/react-navigation-menu（WAI-ARIA 準拠、キーボード操作対応）
 * - モバイル: @radix-ui/react-dialog（Portal / focus trap / Esc / body scroll lock 自動）
 * - スクロール挙動: gsap.matchMedia で prefers-reduced-motion を尊重
 * - 全ナビ項目は DB 駆動。navItems が空なら nav リストのみ省略
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu, Dialog } from "radix-ui";
import { IconChevronDown, IconMenu2, IconX } from "@tabler/icons-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import type { SiteBrand as SiteBrandValue } from "@/shared/domain/settings/queries/display";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from "@/shared/lib/validations/enums/prisma-types";
import { cn } from "@/shared/lib/cn";
import { normalizePreviewPathname } from "@/shared/lib/preview-routes";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { Button } from "@/public/components/design-system/button";
import { LogoutButton } from "@/public/components/ui/logout-button";
import { SiteBrand } from "./site-brand";

/**
 * 顧客認証状態に応じたヘッダー右端のスロット。
 * - `authenticated`: マイページリンク + ログアウトボタンを並置
 * - `guest`: ログインリンクのみ
 * - `null`: 認証導線自体を出さない（特殊ページ向け）
 */
export type HeaderAuthSlot =
  | {
      readonly variant: "authenticated";
      readonly mypageHref: string;
      readonly mypageLabel: string;
    }
  | {
      readonly variant: "guest";
      readonly loginHref: string;
      readonly loginLabel: string;
    };

interface HeaderProps {
  readonly brand: SiteBrandValue;
  readonly navItems: readonly PublicNavItem[];
  readonly scrollBehavior: HeaderScrollBehavior;
  readonly backgroundMode: HeaderBackgroundMode;
  readonly authSlot: HeaderAuthSlot | null;
}

/** Scroll offset (px) where header background becomes opaque */
const SCROLL_THRESHOLD = 80;
/** Accumulated downward scroll (px) before auto_hide hides the header */
const HIDE_THRESHOLD = 150;

/**
 * Editorial underline reveal（Kinfolk / Aesop / Apple 方式）。
 * ::after 疑似要素が左→右に scaleX(0 → 1) で展開し、bronze アクセント下線を描画。
 * hover / focus-visible / aria-current=page（現在ページ）で同じ表示 → 一貫した視覚フィードバック。
 */
const DESKTOP_NAV_LINK_CLASS =
  "relative inline-flex items-center gap-1.5 whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 aria-[current=page]:text-foreground aria-[current=page]:after:origin-left aria-[current=page]:after:scale-x-100";

const DROPDOWN_LINK_CLASS =
  "flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

const MOBILE_PARENT_CLASS =
  "inline-flex min-h-11 items-center gap-2 font-heading text-xl font-light italic tracking-[0.08em] text-foreground transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none";

const MOBILE_CHILD_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

/**
 * 指定された URL が現在のパスと一致するか判定する。
 * ルート "/" は exact 一致、それ以外は segment-aware な prefix 一致。
 * 外部リンクと別 origin の URL は常に false を返す。
 */
function useIsActiveUrl(url: string, isExternal: boolean): boolean {
  const rawPathname = usePathname();
  // preview URL (`/preview/posts/[id]` 等) は本番 URL (`/posts` 等) に正規化して
  // active 判定する。preview と本番で同じ nav 項目が active 表示される。
  const pathname = normalizePreviewPathname(rawPathname);
  if (isExternal || !url.startsWith("/")) return false;
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

/* -------------------------------------------------------------------------- */
/*  Shared link helper — Radix NavigationMenu.Link は asChild + Next.js Link  */
/*  公式推奨パターン: https://www.radix-ui.com/primitives/docs/components/    */
/*    navigation-menu#with-client-side-routing                                */
/* -------------------------------------------------------------------------- */

function NavItemLink({
  item,
  className,
  onNavigate,
  inNavigationMenu = false,
}: {
  readonly item: PublicNavItem;
  readonly className: string;
  readonly onNavigate?: () => void;
  readonly inNavigationMenu?: boolean;
}): ReactElement {
  const isActive = useIsActiveUrl(item.url, item.isExternal);

  const content = (
    <>
      <PortableTextSpans
        spans={item.label}
        iconClassName="h-3.5 w-3.5 shrink-0"
      />
      {item.isExternal && <span className="sr-only"> (新しいタブで開く)</span>}
    </>
  );

  const anchor = item.isExternal ? (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={className}
      {...(onNavigate && { onClick: onNavigate })}
    >
      {content}
    </a>
  ) : (
    <Link
      href={toAppRoute(item.url)}
      aria-current={isActive ? "page" : undefined}
      className={className}
      {...(onNavigate && { onClick: onNavigate })}
    >
      {content}
    </Link>
  );

  if (inNavigationMenu) {
    return (
      <NavigationMenu.Link asChild active={isActive}>
        {anchor}
      </NavigationMenu.Link>
    );
  }
  return anchor;
}

/* -------------------------------------------------------------------------- */
/*  Mobile accordion item — native <details> for parent-with-children         */
/* -------------------------------------------------------------------------- */

function MobileNavItem({
  item,
  onNavigate,
}: {
  readonly item: PublicNavItem;
  readonly onNavigate: () => void;
}): ReactElement {
  if (item.children.length === 0) {
    return (
      <NavItemLink
        item={item}
        className={MOBILE_PARENT_CLASS}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <details className="group flex flex-col items-center">
      <summary
        className={cn(
          MOBILE_PARENT_CLASS,
          "inline-flex cursor-pointer list-none items-center gap-2",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <PortableTextSpans
          spans={item.label}
          iconClassName="h-3.5 w-3.5 shrink-0"
        />
        <IconChevronDown
          className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 flex flex-col items-center gap-3">
        {item.children.map((child) => (
          <NavItemLink
            key={child.id}
            item={child}
            className={MOBILE_CHILD_CLASS}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Header                                                                */
/* -------------------------------------------------------------------------- */

export function Header({
  brand,
  navItems,
  scrollBehavior,
  backgroundMode,
  authSlot,
}: HeaderProps): ReactElement {
  // /reservation は CTA ボタンで導線があるためナビから除外
  const items = navItems.filter((item) => item.url !== "/reservation");
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  // Publish header height as CSS custom property so the hero overlap / sticky
  // sidebars can align to the current header size.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height = entry.borderBoxSize?.[0]?.blockSize ?? header.offsetHeight;
      document.documentElement.style.setProperty(
        "--header-height",
        `${Math.round(height)}px`,
      );
    });

    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Scroll-linked background + hide/show behaviour (prefers-reduced-motion: off
  // → matchMedia cleanup restores styles and leaves the header always visible).
  useGSAP(
    () => {
      const header = headerRef.current;
      if (!header) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        let accumulated = 0;
        let lastDirection: -1 | 0 | 1 = 0;
        let lastScroll = 0;
        let hidden = false;
        let isScrolled = false;

        const show = () => {
          if (!hidden) return;
          hidden = false;
          header.style.translate = "";
        };

        const hide = () => {
          if (hidden) return;
          hidden = true;
          header.style.translate = "0 -100%";
        };

        const updateScrolled = (next: boolean) => {
          if (isScrolled === next) return;
          isScrolled = next;
          setScrolled(next);
          if (backgroundMode === HeaderBackgroundMode.solid) return;
          if (next) {
            header.style.backgroundColor =
              "color-mix(in oklch, var(--color-background) 85%, transparent)";
            header.style.backdropFilter = "blur(24px)";
            header.style.boxShadow = "var(--shadow-sm)";
          } else {
            header.style.backgroundColor = "";
            header.style.backdropFilter = "";
            header.style.boxShadow = "";
          }
        };

        ScrollTrigger.create({
          onUpdate: (self) => {
            const scroll = self.scroll();
            const direction: -1 | 1 = self.direction >= 0 ? 1 : -1;

            updateScrolled(scroll > SCROLL_THRESHOLD);

            if (scrollBehavior === HeaderScrollBehavior.always_visible) return;

            if (scroll <= SCROLL_THRESHOLD) {
              show();
              accumulated = 0;
              lastDirection = 0;
              lastScroll = scroll;
              return;
            }

            const delta = Math.abs(scroll - lastScroll);
            if (direction !== lastDirection) {
              accumulated = 0;
              lastDirection = direction;
            }

            if (direction === 1) {
              if (scrollBehavior === HeaderScrollBehavior.hide_on_scroll) {
                hide();
              } else {
                accumulated += delta;
                if (accumulated >= HIDE_THRESHOLD) hide();
              }
            } else {
              show();
              accumulated = 0;
            }

            lastScroll = scroll;
          },
        });

        return () => {
          header.style.translate = "";
          header.style.backgroundColor = "";
          header.style.backdropFilter = "";
          header.style.boxShadow = "";
        };
      });
    },
    { scope: headerRef },
  );

  return (
    <header
      ref={headerRef}
      role="banner"
      className={cn(
        "sticky top-[var(--announcement-bar-height,0px)] z-40 transition-[background-color,backdrop-filter,box-shadow,border-color,translate] duration-300",
        backgroundMode === HeaderBackgroundMode.transparent
          ? "bg-transparent"
          : "bg-background",
        scrolled && "border-b border-border/50",
      )}
    >
      <div className="mx-auto grid max-w-[var(--container-header-max)] grid-cols-2 items-center justify-items-start gap-6 px-5 py-4 md:grid-cols-3 md:gap-10 md:px-8 md:py-5 lg:gap-16">
        {/* Brand — 左列（container の justify-items-start が default 適用） */}
        <SiteBrand brand={brand} variant="header" />

        {/* Desktop Nav — 中央列（Radix 公式構造: Root > List 単体）。justify-self-center で cell 内中央 */}
        {items.length > 0 && (
          <NavigationMenu.Root
            aria-label="メインナビゲーション"
            className="relative hidden md:col-start-2 md:flex md:justify-self-center"
          >
            <NavigationMenu.List className="flex items-center gap-4 lg:gap-8">
              {items.map((item) => (
                <NavigationMenu.Item key={item.id}>
                  {item.children.length > 0 ? (
                    <>
                      <NavigationMenu.Trigger className="group relative inline-flex items-center gap-1 whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 data-[state=open]:text-foreground data-[state=open]:after:origin-left data-[state=open]:after:scale-x-100">
                        <PortableTextSpans
                          spans={item.label}
                          iconClassName="h-3.5 w-3.5 shrink-0"
                        />
                        <IconChevronDown
                          className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
                          aria-hidden="true"
                        />
                      </NavigationMenu.Trigger>
                      <NavigationMenu.Content className="absolute top-full mt-2 min-w-[180px] rounded-md border border-border bg-background p-2 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                        {item.children.map((child) => (
                          <NavItemLink
                            key={child.id}
                            item={child}
                            className={DROPDOWN_LINK_CLASS}
                            inNavigationMenu
                          />
                        ))}
                      </NavigationMenu.Content>
                    </>
                  ) : (
                    <NavItemLink
                      item={item}
                      className={DESKTOP_NAV_LINK_CLASS}
                      inNavigationMenu
                    />
                  )}
                </NavigationMenu.Item>
              ))}
            </NavigationMenu.List>
          </NavigationMenu.Root>
        )}

        {/* Desktop Auth + CTA — 右列（md:justify-self-end で cell 内右端 / 認証内部 gap-5 / CTA 間 gap-8 で暗黙分離） */}
        <div className="hidden items-center gap-8 md:col-start-3 md:flex md:justify-self-end">
          {authSlot?.variant === "authenticated" && (
            <div className="flex items-center gap-5">
              <Link
                href={toAppRoute(authSlot.mypageHref)}
                className={DESKTOP_NAV_LINK_CLASS}
              >
                {authSlot.mypageLabel}
              </Link>
              <LogoutButton variant="desktop-nav" />
            </div>
          )}
          {authSlot?.variant === "guest" && (
            <Link
              href={toAppRoute(authSlot.loginHref)}
              className={DESKTOP_NAV_LINK_CLASS}
            >
              {authSlot.loginLabel}
            </Link>
          )}
          <Button
            variant="editorial"
            size="sm"
            href="/reservation"
            className="text-[0.75rem] uppercase tracking-[0.18em]"
          >
            Reserve
          </Button>
        </div>

        {/* Mobile — Radix Dialog (focus trap + body scroll lock + Esc) */}
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger
            className="inline-flex h-11 w-11 items-center justify-center justify-self-end text-foreground md:hidden"
            aria-label="メニューを開く"
          >
            <IconMenu2
              className="h-5 w-5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
            <Dialog.Content className="fixed inset-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden">
              <Dialog.Title className="sr-only">
                ナビゲーションメニュー
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                サイト内の主要ページへのリンクと予約・ログインの導線を含みます。
              </Dialog.Description>

              <div className="flex items-center justify-between px-5 py-4">
                <SiteBrand
                  brand={brand}
                  variant="header"
                  onNavigate={closeMenu}
                />
                <Dialog.Close
                  className="inline-flex h-11 w-11 items-center justify-center text-foreground"
                  aria-label="メニューを閉じる"
                >
                  <IconX
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Dialog.Close>
              </div>

              <nav
                aria-label="メインメニュー"
                className="flex flex-1 flex-col overflow-y-auto"
              >
                <div className="flex min-h-full flex-col items-center justify-center gap-6 px-5 py-8">
                  {items.map((item) => (
                    <MobileNavItem
                      key={item.id}
                      item={item}
                      onNavigate={closeMenu}
                    />
                  ))}
                  {authSlot && (
                    <div
                      aria-hidden="true"
                      className="h-px w-16 bg-border/60"
                    />
                  )}
                  {authSlot?.variant === "authenticated" && (
                    <>
                      <Link
                        href={toAppRoute(authSlot.mypageHref)}
                        onClick={closeMenu}
                        className={MOBILE_PARENT_CLASS}
                      >
                        {authSlot.mypageLabel}
                      </Link>
                      <LogoutButton
                        variant="mobile-nav"
                        onBeforeLogout={closeMenu}
                      />
                    </>
                  )}
                  {authSlot?.variant === "guest" && (
                    <Link
                      href={toAppRoute(authSlot.loginHref)}
                      onClick={closeMenu}
                      className={MOBILE_PARENT_CLASS}
                    >
                      {authSlot.loginLabel}
                    </Link>
                  )}
                  <Link
                    href="/reservation"
                    onClick={closeMenu}
                    className="inline-flex min-h-11 items-center justify-center border border-foreground px-5 py-2.5 text-[0.75rem] uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground"
                  >
                    Reserve
                  </Link>
                </div>
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
