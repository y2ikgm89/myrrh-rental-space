"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import {
  IconHome,
  IconLayoutGrid,
  IconCalendarCheck,
  IconUser,
} from "@tabler/icons-react";
import { useSession } from "@/shared/lib/auth-client";

const staticNavItems = [
  { href: "/", icon: IconHome, label: "ホーム" },
  { href: "/spaces", icon: IconLayoutGrid, label: "スペース" },
  { href: "/reservation", icon: IconCalendarCheck, label: "予約" },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isCustomer =
    session?.user?.role === "CUSTOMER" || session?.user?.role === "USER";
  const authItem = session
    ? isCustomer
      ? { href: "/mypage", icon: IconUser, label: "マイページ" }
      : null
    : { href: "/login", icon: IconUser, label: "ログイン" };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden"
      aria-label="モバイルナビゲーション"
    >
      <ul className="flex items-center justify-around py-2">
        {staticNavItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
                  isActive ? "text-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
        {authItem && (
          <li>
            <Link
              href={authItem.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
                pathname.startsWith(authItem.href)
                  ? "text-accent"
                  : "text-muted-foreground",
              )}
            >
              <authItem.icon className="h-5 w-5" />
              <span>{authItem.label}</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
