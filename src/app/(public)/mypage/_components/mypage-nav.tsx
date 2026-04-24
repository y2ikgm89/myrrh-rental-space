"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { toAppRoute, type AppRoute } from "@/shared/lib/typed-routes";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/events", label: "イベント" },
  { href: "/mypage/inquiries", label: "お問い合わせ" },
  { href: "/mypage/settings", label: "設定" },
] satisfies readonly { href: AppRoute; label: string }[];

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
          onChange={(e) => router.push(toAppRoute(e.target.value))}
          aria-label="マイページメニュー"
          className="w-full border-b border-border bg-transparent py-3 text-base tracking-[0.12em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {NAV_ITEMS.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: Nav bar */}
      <div className="hidden md:flex md:justify-center">
        <ul className="flex border-b border-border">
          {NAV_ITEMS.map((item) => {
            const isActive = activeItem?.href === item.href;

            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  style={{ width: "max-content" }}
                  className={cn(
                    "block whitespace-nowrap px-5 py-3 text-base tracking-[0.12em] transition-colors",
                    "underline decoration-2 underline-offset-[6px]",
                    isActive
                      ? "text-accent decoration-accent"
                      : "text-muted-foreground decoration-transparent hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
