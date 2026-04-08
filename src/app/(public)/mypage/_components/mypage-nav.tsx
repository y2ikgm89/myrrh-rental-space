"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/events", label: "イベント" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "設定" },
];

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="マイページナビゲーション"
      className="mb-8 md:mb-12 border-b border-border overflow-x-auto"
    >
      <div className="flex" role="tablist">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/mypage"
              ? pathname === "/mypage"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "shrink-0 px-4 py-3 text-[0.7rem] uppercase tracking-[0.18em] transition-colors whitespace-nowrap",
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
