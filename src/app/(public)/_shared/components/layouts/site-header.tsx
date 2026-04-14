"use client";

/**
 * Site Header — Radix NavigationMenu + Radix Dialog (mobile)
 *
 * - デスクトップ: @radix-ui/react-navigation-menu（WAI-ARIA 準拠、キーボード操作対応）
 * - モバイル: @radix-ui/react-dialog（Portal / focus trap / Esc / body scroll lock 自動）
 * - スクロール挙動: gsap.matchMedia で prefers-reduced-motion を尊重
 * - 全ナビ項目は DB 駆動。navItems が空なら nav リストのみ省略
 */

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { IconChevronDown, IconMenu2, IconX } from "@tabler/icons-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from "@/shared/lib/validations/enums/prisma-types";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/public/components/design-system/button";

interface AuthLink {
  readonly href: string;
  readonly label: string;
}

interface HeaderProps {
  readonly brandName: string;
  readonly navItems: readonly PublicNavItem[];
  readonly scrollBehavior: HeaderScrollBehavior;
  readonly backgroundMode: HeaderBackgroundMode;
  readonly authLink: AuthLink | null;
}

/** Scroll offset (px) where header background becomes opaque */
const SCROLL_THRESHOLD = 80;
/** Accumulated downward scroll (px) before auto_hide hides the header */
const HIDE_THRESHOLD = 150;

const DESKTOP_NAV_LINK_CLASS =
  "whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

const DROPDOWN_LINK_CLASS =
  "block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

const MOBILE_PARENT_CLASS =
  "font-heading text-xl font-light italic tracking-[0.08em] text-foreground transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none";

const MOBILE_CHILD_CLASS =
  "text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

/**
 * 指定された URL が現在のパスと一致するか判定する。
 * ルート "/" は exact 一致、それ以外は segment-aware な prefix 一致。
 * 外部リンクと別 origin の URL は常に false を返す。
 */
function useIsActiveUrl(url: string, isExternal: boolean): boolean {
  const pathname = usePathname();
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
      {item.label}
      {item.isExternal && <span className="sr-only"> (新しいタブで開く)</span>}
    </>
  );

  const anchor = item.isExternal ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      {...(onNavigate && { onClick: onNavigate })}
    >
      {content}
    </a>
  ) : (
    <Link
      href={item.url}
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
        {item.label}
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
  brandName,
  navItems,
  scrollBehavior,
  backgroundMode,
  authLink,
}: HeaderProps): ReactElement {
  // /reservation は CTA ボタンで導線があるためナビから除外
  const items = navItems.filter((item) => item.url !== "/reservation");
  const headerRef = useRef<HTMLElement>(null);
  const mobileTitleId = useId();
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-5 py-4 md:gap-12 md:px-8 md:py-5 lg:gap-16">
        <Link
          href="/"
          className="font-heading whitespace-nowrap text-xl font-light italic tracking-[0.08em] text-foreground"
        >
          {brandName}
        </Link>

        {/* Desktop — Radix NavigationMenu */}
        <NavigationMenu.Root
          aria-label="メインナビゲーション"
          className="relative hidden items-center gap-4 lg:gap-8 md:flex"
        >
          {items.length > 0 && (
            <NavigationMenu.List className="flex items-center gap-4 lg:gap-8">
              {items.map((item) => (
                <NavigationMenu.Item key={item.id}>
                  {item.children.length > 0 ? (
                    <>
                      <NavigationMenu.Trigger className="group inline-flex items-center gap-1 whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
                        {item.label}
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
          )}

          {authLink && (
            <Link href={authLink.href} className={DESKTOP_NAV_LINK_CLASS}>
              {authLink.label}
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
        </NavigationMenu.Root>

        {/* Mobile — Radix Dialog (focus trap + body scroll lock + Esc) */}
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger
            className="flex h-10 w-10 items-center justify-center text-foreground md:hidden"
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
            <Dialog.Content
              aria-labelledby={mobileTitleId}
              className="fixed inset-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden"
            >
              <Dialog.Title id={mobileTitleId} className="sr-only">
                ナビゲーションメニュー
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                サイト内の主要ページへのリンクと予約・ログインの導線を含みます。
              </Dialog.Description>

              <div className="flex items-center justify-between px-5 py-4">
                <Link
                  href="/"
                  onClick={closeMenu}
                  className="font-heading text-xl font-light italic tracking-[0.08em] text-foreground"
                >
                  {brandName}
                </Link>
                <Dialog.Close
                  className="flex h-10 w-10 items-center justify-center text-foreground"
                  aria-label="メニューを閉じる"
                >
                  <IconX
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Dialog.Close>
              </div>

              <nav className="flex flex-1 flex-col items-center justify-center gap-8">
                <Link
                  href="/reservation"
                  onClick={closeMenu}
                  className="inline-flex items-center justify-center border border-foreground px-5 py-2.5 text-[0.75rem] uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground"
                >
                  Reserve
                </Link>
                {authLink && (
                  <Link
                    href={authLink.href}
                    onClick={closeMenu}
                    className={MOBILE_PARENT_CLASS}
                  >
                    {authLink.label}
                  </Link>
                )}
                {items.map((item) => (
                  <MobileNavItem
                    key={item.id}
                    item={item}
                    onNavigate={closeMenu}
                  />
                ))}
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
