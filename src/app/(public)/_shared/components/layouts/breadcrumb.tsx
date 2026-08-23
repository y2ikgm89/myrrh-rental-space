import Link from "next/link";
import { IconHome } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
  /** "sm" reduces padding and icon size for compact breadcrumb bars */
  readonly size?: "default" | "sm";
}

/**
 * 表示専用のパンくず。**構造化データは出さない**（監査 A-89）。
 *
 * 以前はここからも `BreadcrumbJsonLd` を発行しており、しかも
 * `items.filter((item) => item.href)` で **href を持たない末端（現在ページ）を落としていた**。
 * ページ側も別途 `BreadcrumbJsonLd` を出しているので、blog / news / spaces の
 * 詳細ページには BreadcrumbList が 2 本入り、片方は自分自身で終わらない
 * （「ホーム › ブログ」で止まる）trail になっていた。
 *
 * 発行元はページ側に 1 本化してある。ここに戻すな。
 */
export function Breadcrumb({ items, size = "default" }: BreadcrumbProps) {
  const isSmall = size === "sm";

  return (
    <>
      <nav
        aria-label="パンくずリスト"
        className="text-xs uppercase tracking-eyebrow text-muted-foreground"
      >
        <ol className="flex items-center gap-1.5">
          <li>
            <Link
              href="/"
              className={cn(
                "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center hover:text-foreground",
                isSmall ? "px-2" : "px-3",
              )}
              aria-label="ホーム"
            >
              <IconHome
                className={isSmall ? "h-3.5 w-3.5" : "h-4 w-4"}
                aria-hidden="true"
              />
            </Link>
          </li>
          {items.map((item, i) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-border">
                /
              </span>
              {item.href && i < items.length - 1 ? (
                <Link
                  href={toAppRoute(item.href)}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center hover:text-foreground",
                    isSmall ? "px-2" : "px-3",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
