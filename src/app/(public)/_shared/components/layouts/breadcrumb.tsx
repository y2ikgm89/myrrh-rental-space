import Link from "next/link";
import { Home } from "lucide-react";

interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: "/" },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.label,
        ...(item.href ? { item: item.href } : {}),
      })),
    ],
  };

  // JSON-LD structured data — JSON.stringify produces safe output (no raw HTML)
  const jsonLdHtml = JSON.stringify(jsonLd);

  return (
    <>
      {/* eslint-disable @eslint-react/dom/no-dangerously-set-innerhtml -- JSON-LD structured data: JSON.stringify produces safe output */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      {/* eslint-enable @eslint-react/dom/no-dangerously-set-innerhtml */}
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
