"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/events", label: "イベント申込" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "アカウント設定" },
];

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="マイページナビゲーション"
      className="flex gap-1 sm:gap-4 border-b border-border mb-4 md:mb-8"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/mypage"
            ? pathname === "/mypage"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`py-2 px-3 text-sm sm:text-base transition-colors ${
              isActive
                ? "text-primary font-medium border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
