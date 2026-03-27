import Link from "next/link";
import { Home } from "lucide-react";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          ...items
            .filter((item) => item.href)
            .map((item) => ({ name: item.label, url: item.href ?? "/" })),
        ]}
      />
      <nav
        aria-label="パンくずリスト"
        className="text-sm text-muted-foreground"
      >
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-accent" aria-label="ホーム">
              <Home className="h-4 w-4" />
            </Link>
          </li>
          {items.map((item, i) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-border">
                /
              </span>
              {item.href && i < items.length - 1 ? (
                <Link href={item.href} className="hover:text-accent">
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
