"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * /mypage 配下のセクションナビ。
 *
 * 設計:
 * - mobile / desktop で同一 DOM (4 NAV_ITEMS を 1 `<ul>`) を共有し、
 *   `grid grid-cols-4` (mobile) ↔ `md:flex md:justify-center` (desktop) で
 *   layout だけ切替える。全項目常時可視で 3-tap 動線を構造的に排除。
 * - `<Link>` で next/router の prefetch を活用。
 * - active 表示は `aria-current="page"` を sole source of truth とし、
 *   `aria-[current=page]:` variant でスタイル分岐。
 * - タッチ標的: `min-h-[var(--touch-target-min)]` (= 44px) を担保。
 * - mobile ラベル収容: 375px viewport では container padding 16px 両側を
 *   引いた 343px を 4 等分すると 85.75px / cell となり、`text-sm` (14px)
 *   × 6 文字の「お問い合わせ」に tracking を加えると溢れる。よって
 *   `whitespace-nowrap` と `tracking-[0.12em]` を `md:` 以上に限定し、
 *   mobile では 2 行折り返しを許容する（`min-h-11` により高さは維持）。
 */

const NAV_ITEMS = [
  { href: "/mypage", label: "予約" },
  { href: "/mypage/events", label: "イベント" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "設定" },
] satisfies readonly { href: Route; label: string }[];

function isActive(pathname: string, href: string): boolean {
  return href === "/mypage"
    ? pathname === "/mypage"
    : pathname.startsWith(href);
}

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="マイページナビゲーション"
      className="mb-8 md:mb-12 border-b border-border"
    >
      <ul className="grid grid-cols-4 md:flex md:justify-center">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="md:shrink-0">
            <Link
              href={item.href}
              {...(isActive(pathname, item.href) && { "aria-current": "page" })}
              className="flex min-h-[var(--touch-target-min)] items-center justify-center px-2 py-3 text-center text-sm text-muted-foreground underline decoration-2 decoration-transparent underline-offset-[6px] transition-colors hover:text-foreground aria-[current=page]:text-accent aria-[current=page]:decoration-accent md:whitespace-nowrap md:px-5 md:text-base md:tracking-[0.12em]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
