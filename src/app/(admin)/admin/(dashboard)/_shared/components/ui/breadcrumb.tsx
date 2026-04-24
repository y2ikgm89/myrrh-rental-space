import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";
import type { ReactElement } from "react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({
  items,
  className,
}: BreadcrumbProps): ReactElement {
  return (
    <nav aria-label="パンくずリスト" className={cn("mb-4", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              {index > 0 && (
                <IconChevronRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  className={cn(isLast && "font-medium text-foreground")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={toAppRoute(item.href)}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
