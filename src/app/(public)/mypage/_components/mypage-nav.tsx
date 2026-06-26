"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * /mypage 配下のセクションナビ。
 *
 * 設計（PR #605 の妥協 native `<select>` 撤去・SSoT 統一）:
 * - mobile / desktop で同一 DOM (4 NAV_ITEMS を 1 `<ul>`) を共有し、
 *   `grid grid-cols-4` (mobile) ↔ `md:flex md:justify-center` (desktop) で
 *   layout だけ切替える。全項目が常時可視で「お問い合わせのみ表示」型の
 *   情報設計破綻と 3-tap 動線を構造的に排除。
 * - `<Link>` で next/router の prefetch を活用（旧版の `useRouter().push` は撤去）。
 * - active 表示は `aria-current="page"` のみで sole source of truth とし、
 *   `aria-[current=page]:` variant でスタイル分岐（className 内の条件式禁止）。
 * - WCAG 2.5.5 AAA: 各 cell は `min-h-[var(--touch-target-min)]` (= 44px) で
 *   タッチ標的を担保。375px で 4 等分 ≒ 88px / cell に各ラベル (最長 6 文字
 *   = お問い合わせ) を text-sm で収容。
 *
 * 公式 Tailwind v4 docs: https://tailwindcss.com/docs/grid-template-columns
 */

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
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
              className="flex min-h-[var(--touch-target-min)] items-center justify-center whitespace-nowrap px-2 py-3 text-sm tracking-[0.12em] underline decoration-2 underline-offset-[6px] text-muted-foreground decoration-transparent transition-colors hover:text-foreground aria-[current=page]:text-accent aria-[current=page]:decoration-accent md:px-5 md:text-base"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
