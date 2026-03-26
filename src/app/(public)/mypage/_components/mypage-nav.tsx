"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/settings", label: "アカウント設定" },
];

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-border mb-8 pb-2">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/mypage"
            ? pathname === "/mypage"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "text-primary font-medium border-b-2 border-primary pb-2"
                : "text-muted-foreground pb-2"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
