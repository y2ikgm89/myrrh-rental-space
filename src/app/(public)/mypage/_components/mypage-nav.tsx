"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/shared/lib/cn";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/events", label: "イベント" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "設定" },
];

function getActiveItem(pathname: string) {
  return (
    NAV_ITEMS.find((item) =>
      item.href === "/mypage"
        ? pathname === "/mypage"
        : pathname.startsWith(item.href),
    ) ?? NAV_ITEMS[0]
  );
}

export function MypageNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = getActiveItem(pathname);

  return (
    <nav aria-label="マイページナビゲーション" className="mb-8 md:mb-12">
      {/* Mobile: Select dropdown */}
      <div className="md:hidden">
        <select
          value={activeItem?.href ?? "/mypage"}
          onChange={(e) => router.push(e.target.value)}
          aria-label="マイページメニュー"
          className="w-full border-b border-border bg-transparent py-3 text-sm tracking-[0.18em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {NAV_ITEMS.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: Tab bar */}
      <div className="hidden md:flex border-b border-border" role="tablist">
        {NAV_ITEMS.map((item) => {
          const isActive = activeItem?.href === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "shrink-0 px-5 py-3 text-sm tracking-[0.18em] transition-colors whitespace-nowrap",
                isActive
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
