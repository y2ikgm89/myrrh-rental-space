"use client";

/**
 * Header — Partially persistent sticky header
 *
 * Positioned below the announcement bar in normal flow.
 * Sticks to viewport top when scrolled past announcement bar (Shopify Dawn pattern).
 * Starts transparent, gains white backdrop on scroll via style attributes.
 * Hides on sustained downward scroll (~150px), reappears immediately on upward scroll.
 * Mobile: fullscreen overlay menu with GSAP animation.
 * Navigation items from DB via props.
 * Desktop: Radix NavigationMenu with submenu dropdowns for items with children.
 *
 * Scroll-linked behaviour uses useGSAP + ScrollTrigger + gsap.matchMedia (pattern A).
 * Visual changes are applied via inline style (style.translate, style.backgroundColor, etc.)
 * to avoid conflicts with React-controlled className on re-render.
 * CSS `transition` on the element handles the smooth animation.
 */

import { useState, useRef, useEffect, useId, type ReactElement } from "react";
import Link from "next/link";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { EASE } from "@/public/lib/animations";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from "@generated/prisma/enums";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/public/components/design-system/button";

interface AuthLink {
  readonly href: string;
  readonly label: string;
}

interface HeaderProps {
  readonly brandName?: string;
  readonly navItems?: readonly PublicNavItem[];
  readonly scrollBehavior?: HeaderScrollBehavior;
  readonly backgroundMode?: HeaderBackgroundMode;
  readonly authLink?: AuthLink;
}

const FALLBACK_NAV: readonly PublicNavItem[] = [
  { id: "home", label: "IconHome", url: "/", isExternal: false, children: [] },
  {
    id: "events",
    label: "イベント",
    url: "/events",
    isExternal: false,
    children: [],
  },
  {
    id: "reservation",
    label: "Reservation",
    url: "/reservation",
    isExternal: false,
    children: [],
  },
  {
    id: "contact",
    label: "Contact",
    url: "/contact",
    isExternal: false,
    children: [],
  },
];

/** Scroll position (px) where header gains opaque background */
const SCROLL_THRESHOLD = 80;
/** Accumulated downward scroll distance (px) before header hides */
const HIDE_THRESHOLD = 150;

/* -------------------------------------------------------------------------- */
/*  Desktop sub-components                                                     */
/* -------------------------------------------------------------------------- */

/** Desktop nav link for items WITHOUT children */
function NavLink({ item }: { readonly item: PublicNavItem }): ReactElement {
  const linkClass =
    "text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground";

  if (item.isExternal) {
    return (
      <NavigationMenuPrimitive.Link asChild>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      </NavigationMenuPrimitive.Link>
    );
  }

  return (
    <NavigationMenuPrimitive.Link asChild>
      <Link href={item.url} className={linkClass}>
        {item.label}
      </Link>
    </NavigationMenuPrimitive.Link>
  );
}

/** Desktop dropdown link for child items inside a submenu */
function DropdownLink({
  item,
}: {
  readonly item: PublicNavItem;
}): ReactElement {
  const linkClass =
    "block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface";

  if (item.isExternal) {
    return (
      <NavigationMenuPrimitive.Link asChild>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      </NavigationMenuPrimitive.Link>
    );
  }

  return (
    <NavigationMenuPrimitive.Link asChild>
      <Link href={item.url} className={linkClass}>
        {item.label}
      </Link>
    </NavigationMenuPrimitive.Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mobile sub-component                                                       */
/* -------------------------------------------------------------------------- */

/** Mobile overlay nav item — handles accordion expand for items with children */
function MobileNavItem({
  item,
  onClose,
}: {
  readonly item: PublicNavItem;
  readonly onClose: () => void;
}): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  const parentClass =
    "font-heading text-xl font-light italic tracking-[0.08em] text-foreground transition-colors hover:text-muted-foreground";

  if (item.children.length === 0) {
    if (item.isExternal) {
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          data-menu-link=""
          onClick={onClose}
          className={parentClass}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      );
    }

    return (
      <Link
        href={item.url}
        data-menu-link=""
        onClick={onClose}
        className={parentClass}
      >
        {item.label}
      </Link>
    );
  }

  // Item with children — accordion
  return (
    <div data-menu-link="" className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className={cn(parentClass, "inline-flex items-center gap-2")}
      >
        {item.label}
        <IconChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div id={contentId} className="mt-3 flex flex-col items-center gap-3">
          {item.children.map((child) =>
            child.isExternal ? (
              <a
                key={child.id}
                href={child.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="text-base text-muted-foreground transition-colors hover:text-foreground"
              >
                {child.label}
                <span className="sr-only"> (新しいタブで開く)</span>
              </a>
            ) : (
              <Link
                key={child.id}
                href={child.url}
                onClick={onClose}
                className="text-base text-muted-foreground transition-colors hover:text-foreground"
              >
                {child.label}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Header                                                                */
/* -------------------------------------------------------------------------- */

export function Header({
  brandName = "MYRRH",
  navItems,
  scrollBehavior = HeaderScrollBehavior.always_visible,
  backgroundMode = HeaderBackgroundMode.solid,
  authLink,
}: HeaderProps): ReactElement {
  const items = navItems ?? FALLBACK_NAV;
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const motionOk = useMotionPreference();
  const mobileMenuId = useId();

  const [scrolled, setScrolled] = useState(false);

  // Bridge React state → ref for reading inside ScrollTrigger callback
  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  // Publish header height as CSS custom property for hero overlap
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

  // Scroll-linked header behaviour — gsap.matchMedia pattern A
  // When reduced-motion is preferred, the matchMedia context auto-reverts:
  // the ScrollTrigger is destroyed and the cleanup function restores styles.
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
          // solid モードでは背景はCSSクラスで固定、style操作不要
          if (backgroundMode === HeaderBackgroundMode.solid) return;
          // transparent モードのみ style で制御
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

            // Background opacity (applies to all modes)
            updateScrolled(scroll > SCROLL_THRESHOLD);

            // always_visible: background change only, no hide/show
            if (scrollBehavior === HeaderScrollBehavior.always_visible) return;

            // Mobile menu open → always visible
            if (menuOpenRef.current) {
              show();
              accumulated = 0;
              lastScroll = scroll;
              return;
            }

            // Near page top → always visible, reset accumulation
            if (scroll <= SCROLL_THRESHOLD) {
              show();
              accumulated = 0;
              lastDirection = 0;
              lastScroll = scroll;
              return;
            }

            const delta = Math.abs(scroll - lastScroll);

            // Direction changed → reset accumulation
            if (direction !== lastDirection) {
              accumulated = 0;
              lastDirection = direction;
            }

            if (direction === 1) {
              // Scrolling down
              if (scrollBehavior === HeaderScrollBehavior.hide_on_scroll) {
                // hide_on_scroll: hide immediately on any downward scroll
                hide();
              } else {
                // auto_hide: accumulate distance before hiding
                accumulated += delta;
                if (accumulated >= HIDE_THRESHOLD) {
                  hide();
                }
              }
            } else if (direction === -1) {
              // Scrolling up: show immediately
              show();
              accumulated = 0;
            }

            lastScroll = scroll;
          },
        });

        // matchMedia cleanup: ensure header is visible when reduced-motion activates
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

  // Kill any in-flight menu animations on unmount
  useEffect(() => {
    const overlay = overlayRef.current;
    return () => {
      if (overlay) {
        gsap.killTweensOf(overlay);
        gsap.killTweensOf(overlay.querySelectorAll("[data-menu-link]"));
      }
    };
  }, []);

  const openMenu = () => {
    setMenuOpen(true);
    const reduced = !motionOk.current;
    requestAnimationFrame(() => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const links = overlay.querySelectorAll("[data-menu-link]");
      gsap.fromTo(
        overlay,
        { opacity: 0 },
        { opacity: 1, duration: reduced ? 0.15 : 0.3, ease: EASE.outQuad },
      );
      gsap.fromTo(
        links,
        { opacity: 0, y: reduced ? 0 : 20 },
        {
          opacity: 1,
          y: 0,
          stagger: reduced ? 0 : 0.06,
          duration: reduced ? 0.15 : 0.4,
          ease: EASE.outCubic,
          delay: reduced ? 0 : 0.15,
        },
      );
    });
  };

  const closeMenu = () => {
    const overlay = overlayRef.current;
    if (!overlay) {
      setMenuOpen(false);
      hamburgerRef.current?.focus();
      return;
    }
    const reduced = !motionOk.current;
    gsap.to(overlay, {
      opacity: 0,
      duration: reduced ? 0.1 : 0.25,
      ease: EASE.inQuad,
      onComplete: () => {
        setMenuOpen(false);
        hamburgerRef.current?.focus();
      },
    });
  };

  return (
    <>
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8 md:py-5">
          <Link
            href="/"
            className="font-heading text-xl font-light italic tracking-[0.08em] text-foreground"
          >
            {brandName}
          </Link>

          {/* Desktop navigation */}
          <div className="hidden items-center gap-8 md:flex">
            <NavigationMenuPrimitive.Root
              className="relative"
              aria-label="メインナビゲーション"
            >
              <NavigationMenuPrimitive.List className="flex items-center gap-8">
                {items.map((item) => (
                  <NavigationMenuPrimitive.Item key={item.id}>
                    {item.children.length > 0 ? (
                      <>
                        <NavigationMenuPrimitive.Trigger className="group inline-flex items-center gap-1 text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                          {item.label}
                          <IconChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </NavigationMenuPrimitive.Trigger>
                        <NavigationMenuPrimitive.Content className="absolute top-full mt-2 min-w-[180px] rounded-md border border-border bg-background p-2 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                          {item.children.map((child) => (
                            <DropdownLink key={child.id} item={child} />
                          ))}
                        </NavigationMenuPrimitive.Content>
                      </>
                    ) : (
                      <NavLink item={item} />
                    )}
                  </NavigationMenuPrimitive.Item>
                ))}
              </NavigationMenuPrimitive.List>
            </NavigationMenuPrimitive.Root>

            {authLink && (
              <Link
                href={authLink.href}
                className="text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {authLink.label}
              </Link>
            )}
            <Button
              variant="editorial"
              size="sm"
              href="/reservation"
              className="text-[0.6rem] uppercase tracking-[0.18em]"
            >
              Reserve
            </Button>
          </div>

          {/* Hamburger (mobile) */}
          <button
            ref={hamburgerRef}
            type="button"
            onClick={openMenu}
            className="flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
            aria-controls={mobileMenuId}
          >
            <div className="flex flex-col gap-1.5">
              <span className="block h-px w-5 bg-foreground" />
              <span className="block h-px w-5 bg-foreground" />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile fullscreen overlay */}
      {menuOpen && (
        <div
          id={mobileMenuId}
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <Link
              href="/"
              className="font-heading text-xl font-light italic tracking-[0.08em] text-foreground"
              onClick={closeMenu}
            >
              {brandName}
            </Link>
            <button
              type="button"
              onClick={closeMenu}
              className="flex h-10 w-10 items-center justify-center"
              aria-label="メニューを閉じる"
            >
              <IconX className="h-5 w-5 text-foreground" strokeWidth={1.5} />
            </button>
          </div>

          <nav className="flex flex-1 flex-col items-center justify-center gap-8">
            <Link
              href="/reservation"
              data-menu-link=""
              onClick={closeMenu}
              className="inline-flex items-center justify-center border border-foreground px-5 py-2.5 text-[0.75rem] uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground"
            >
              Reserve
            </Link>
            {authLink && (
              <Link
                href={authLink.href}
                data-menu-link=""
                onClick={closeMenu}
                className="font-heading text-xl font-light italic tracking-[0.08em] text-foreground transition-colors hover:text-muted-foreground"
              >
                {authLink.label}
              </Link>
            )}
            {items.map((item) => (
              <MobileNavItem key={item.id} item={item} onClose={closeMenu} />
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
