import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";

export const metadata: Metadata = {
  title: "ページが見つかりません",
  description: "お探しのページは存在しないか、移動した可能性があります。",
  robots: {
    index: false,
    follow: false,
  },
};

const POPULAR_DESTINATIONS: ReadonlyArray<{
  readonly href:
    | "/spaces"
    | "/events"
    | "/blog"
    | "/news"
    | "/faq"
    | "/contact";
  readonly label: string;
  readonly description: string;
}> = [
  { href: "/spaces", label: "スペース", description: "貸切可能な空間一覧" },
  { href: "/events", label: "イベント", description: "開催予定・参加申込" },
  { href: "/blog", label: "ブログ", description: "最新の記事・コラム" },
  { href: "/news", label: "お知らせ", description: "運営からのお知らせ" },
  { href: "/faq", label: "よくある質問", description: "利用方法・料金" },
  { href: "/contact", label: "お問い合わせ", description: "ご質問・ご要望" },
];

export default function PublicNotFound() {
  return (
    <main id="main-content">
      <Container>
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-[var(--space-lg)]">
          <Stack gap="lg" className="items-center text-center">
            <span
              className="font-heading text-8xl font-bold text-border"
              aria-hidden="true"
            >
              404
            </span>

            <Heading level={1}>ページが見つかりません</Heading>

            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              お探しのページは存在しないか、
              <br />
              移動した可能性があります。
            </p>

            <Stack
              direction="horizontal"
              gap="sm"
              className="flex-col sm:flex-row"
            >
              <Button href="/" variant="editorial">
                ホームに戻る
              </Button>
            </Stack>

            <div className="@container w-full max-w-2xl pt-8">
              <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                よく訪問されるページ
              </h2>
              <ul className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @md:grid-cols-3">
                {POPULAR_DESTINATIONS.map((destination) => (
                  <li key={destination.href}>
                    <Link
                      href={destination.href}
                      className="block min-h-11 border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {destination.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {destination.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Stack>
        </div>
      </Container>
    </main>
  );
}
