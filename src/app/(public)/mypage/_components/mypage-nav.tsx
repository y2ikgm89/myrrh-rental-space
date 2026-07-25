"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isMypageNavActive } from "./mypage-nav-active";
import {
  getMypageNavGridClass,
  getVisibleMypageNavItems,
  type MypageNavFeatureFlags,
} from "./mypage-nav-items";

/**
 * /mypage 配下のセクションナビ。
 *
 * 設計:
 * - mobile / desktop で同一 DOM を共有し、
 *   `grid grid-cols-{N}` (mobile, N = 可視件数) ↔ `md:flex md:justify-center`
 *   (desktop) で layout だけ切替える。feature OFF の項目は server layout から
 *   渡した flags で prune し、固定 grid-cols-5 を使わない（clean-break）。
 * - `<Link>` で next/router の prefetch を活用。
 * - active 表示は `aria-current="page"` を sole source of truth とし、
 *   `aria-[current=page]:` variant でスタイル分岐。
 * - タッチ標的: `min-h-[var(--touch-target-min)]` (= 44px) を担保。
 * - mobile ラベル収容: 375px viewport では container padding 16px 両側を
 *   引いた幅を可視件数で等分する。`whitespace-nowrap` と
 *   `tracking-[0.12em]` を `md:` 以上に限定し、mobile では 2 行折り返しを
 *   許容する（`min-h-11` により高さは維持）。
 */

export type MypageNavProps = MypageNavFeatureFlags;

export function MypageNav({ eventsEnabled, contactEnabled }: MypageNavProps) {
  const pathname = usePathname();
  const items = getVisibleMypageNavItems({ eventsEnabled, contactEnabled });
  const gridClass = getMypageNavGridClass(items.length);

  return (
    <nav
      aria-label="マイページナビゲーション"
      className="mb-8 md:mb-12 border-b border-border"
    >
      <ul className={`grid ${gridClass} md:flex md:justify-center`}>
        {items.map((item) => (
          <li key={item.href} className="md:shrink-0">
            <Link
              href={item.href}
              {...(isMypageNavActive(pathname, item.href) && {
                "aria-current": "page",
              })}
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
