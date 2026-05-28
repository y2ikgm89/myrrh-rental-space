import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactElement } from "react";

import { Container } from "@/public/components/design-system/container";
import { Section } from "@/public/components/design-system/section";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ImageFrame } from "@/public/components/design-system/image-frame";

export type RelatedExternalLinkData = {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
};

interface RelatedLinksProps {
  readonly links: readonly RelatedExternalLinkData[];
}

/**
 * 外部リンクカード (公開イベント詳細ページ末尾)。
 *
 * 業界標準: メディア掲載記事・公式サイト・参考リンク等を内部記事と分離して表示
 * (Hashnode / Notion / Linear 全社同パターン)。SEO penalty 回避のため
 * `rel="nofollow noreferrer"` + `target="_blank"`、視覚的に外部遷移を示す ↗ icon。
 */
export function RelatedLinks({
  links,
}: RelatedLinksProps): ReactElement | null {
  if (links.length === 0) return null;

  return (
    <Section border="top" aria-labelledby="related-links-heading">
      <Container>
        <Stack gap="lg">
          <Heading level={2} accent className="text-center">
            <span id="related-links-heading">関連リンク</span>
          </Heading>
          <ul className="grid grid-cols-1 gap-8 @container @md:grid-cols-2 @3xl:grid-cols-3">
            {links.map((link) => (
              <li key={link.id}>
                <article className="group flex flex-col gap-3">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="nofollow noreferrer"
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {link.imageUrl ? (
                      <ImageFrame
                        src={link.imageUrl}
                        alt={link.title}
                        aspect="landscape"
                        fill
                        sizes="(min-width: 1280px) 380px, (min-width: 768px) 50vw, 100vw"
                        rounded
                        className="transition-opacity duration-300 group-hover:opacity-85"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-surface transition-colors group-hover:bg-muted/40">
                        <IconArrowUpRight
                          aria-hidden
                          className="h-10 w-10 text-muted-foreground"
                        />
                      </div>
                    )}
                  </a>
                  <div className="space-y-2 px-1">
                    <p className="flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-accent">
                      <IconArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      <span>外部リンク</span>
                    </p>
                    <h3 className="text-h3 text-foreground">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="nofollow noreferrer"
                        className="transition-colors hover:text-foreground/80"
                      >
                        {link.title}
                      </a>
                    </h3>
                    {link.description && link.description.length > 0 && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {link.description}
                      </p>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </Stack>
      </Container>
    </Section>
  );
}
