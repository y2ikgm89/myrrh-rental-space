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
 *
 * Scroll-linked behaviour uses useGSAP + ScrollTrigger + gsap.matchMedia (pattern A).
 * Visual changes are applied via inline style (style.translate, style.backgroundColor, etc.)
 * to avoid conflicts with React-controlled className on re-render.
 * CSS `transition` on the element handles the smooth animation.
 */

import { useState, useRef, useEffect, type ReactElement } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";
import { HeaderScrollBehavior, HeaderBackgroundMode } from "@/shared/db/enums";
import { cn } from "@/shared/lib/cn";

interface HeaderProps {
  readonly brandName?: string;
  readonly navItems?: readonly PublicNavItem[];
  readonly scrollBehavior?: HeaderScrollBehavior;
  readonly backgroundMode?: HeaderBackgroundMode;
}

const FALLBACK_NAV: readonly PublicNavItem[] = [
  { id: "home", label: "Home", url: "/", isExternal: false, children: [] },
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

export function Header({
  brandName = "MYRRH",
  navItems,
  scrollBehavior = HeaderScrollBehavior.always_visible,
  backgroundMode = HeaderBackgroundMode.solid,
}: HeaderProps): ReactElement {
  const items = navItems ?? FALLBACK_NAV;
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionPreference();

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
        let scrolled = false;

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

        const setScrolled = (next: boolean) => {
          if (scrolled === next) return;
          scrolled = next;
          // solid モードでは背景はCSSクラスで固定、style操作不要
          if (backgroundMode === HeaderBackgroundMode.solid) return;
          // transparent モードのみ style で制御
          if (next) {
            header.style.backgroundColor = "oklch(0.995 0.002 250 / 0.9)";
            header.style.backdropFilter = "blur(24px)";
            header.style.boxShadow = "0 1px 2px 0 rgb(0 0 0 / 0.03)";
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
            setScrolled(scroll > SCROLL_THRESHOLD);

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
        { opacity: 1, duration: reduced ? 0.15 : 0.3, ease: "power2.out" },
      );
      gsap.fromTo(
        links,
        { opacity: 0, y: reduced ? 0 : 20 },
        {
          opacity: 1,
          y: 0,
          stagger: reduced ? 0 : 0.06,
          duration: reduced ? 0.15 : 0.4,
          ease: "power3.out",
          delay: reduced ? 0 : 0.15,
        },
      );
    });
  };

  const closeMenu = () => {
    const overlay = overlayRef.current;
    if (!overlay) {
      setMenuOpen(false);
      return;
    }
    const reduced = !motionOk.current;
    gsap.to(overlay, {
      opacity: 0,
      duration: reduced ? 0.1 : 0.25,
      ease: "power2.in",
      onComplete: () => setMenuOpen(false),
    });
  };

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "sticky top-[var(--announcement-bar-height,0px)] z-40 transition-[background-color,backdrop-filter,box-shadow,translate] duration-300",
          backgroundMode === HeaderBackgroundMode.transparent
            ? "bg-transparent"
            : "bg-background",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8 md:py-5">
          <Link
            href="/"
            className="font-heading text-lg tracking-[0.15em] text-foreground"
          >
            {brandName}
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="メインナビゲーション" className="hidden md:block">
            <ul className="flex items-center gap-8">
              {items.map((item) => (
                <li key={item.id}>
                  {item.isExternal ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
                    >
                      {item.label}
                      <span className="sr-only"> (新しいタブで開く)</span>
                    </a>
                  ) : (
                    <Link
                      href={item.url}
                      className="text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary-dark"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Hamburger (mobile) */}
          <button
            type="button"
            onClick={openMenu}
            className="flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
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
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <Link
              href="/"
              className="font-heading text-lg tracking-[0.15em] text-foreground"
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
              <svg
                className="h-5 w-5 text-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col items-center justify-center gap-8">
            {items.map((item) =>
              item.isExternal ? (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-menu-link=""
                  onClick={closeMenu}
                  className="font-heading text-2xl uppercase tracking-[0.2em] text-foreground transition-colors hover:text-primary-dark"
                >
                  {item.label}
                  <span className="sr-only"> (新しいタブで開く)</span>
                </a>
              ) : (
                <Link
                  key={item.id}
                  href={item.url}
                  data-menu-link=""
                  onClick={closeMenu}
                  className="font-heading text-2xl uppercase tracking-[0.2em] text-foreground transition-colors hover:text-primary-dark"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      )}
    </>
  );
}
