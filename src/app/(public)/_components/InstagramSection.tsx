/**
 * InstagramSection — Instagram feed display (Server Component)
 *
 * Displays real Instagram posts from DB in a responsive grid.
 * ScrollReveal for entrance animation.
 */

import Image from "next/image";
import type { ReactElement } from "react";
import { IconBrandInstagram, IconPlayerPlay } from "@tabler/icons-react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleStyle,
  getTitleClasses,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { cn } from "@/shared/lib/cn";
import { getGridColsClass, GAP_MAP } from "@/public/lib/section-style-maps";
import type { InstagramConfig } from "@/shared/lib/validations/section";
import { parseGapSize } from "@/shared/lib/validations/section-parsers";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type { InstagramPostData } from "@/shared/domain/instagram/types";

interface InstagramSectionProps {
  readonly config: InstagramConfig;
  readonly style: SectionStylePayload;
  readonly posts: InstagramPostData[];
}

export function InstagramSection({
  config,
  style,
  posts,
}: InstagramSectionProps): ReactElement {
  const displayPosts = posts.slice(0, config.count);

  return (
    <SectionWrapper style={style}>
      <div className="mb-10 text-center md:mb-14">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <div style={getTitleStyle(style)}>
          <Heading
            level={2}
            className={cn("mt-4", getTitleClasses(style), "tracking-tight")}
          >
            {config.title}
          </Heading>
        </div>
      </div>

      {displayPosts.length === 0 ? (
        <ScrollReveal>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <IconBrandInstagram
              className="mb-4 h-10 w-10 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm">投稿を準備中です</p>
          </div>
        </ScrollReveal>
      ) : (
        <ScrollReveal>
          <div
            className={cn(
              "@container grid",
              getGridColsClass(config.columns),
              GAP_MAP[parseGapSize(config.gap)],
            )}
          >
            {displayPosts.map((post) => (
              <a
                key={post.id}
                href={post.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-square overflow-hidden bg-muted"
              >
                {post.mediaUrl ? (
                  <Image
                    src={post.mediaUrl}
                    alt={post.caption ?? "Instagram投稿"}
                    fill
                    className="object-cover transition-opacity duration-300 group-hover:opacity-85"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <IconBrandInstagram
                      className="h-8 w-8 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  </div>
                )}

                {/* Hover overlay with Instagram icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <IconBrandInstagram
                    className="h-8 w-8 text-background"
                    aria-hidden="true"
                  />
                </div>

                {/* Video indicator */}
                {post.mediaType === "VIDEO" && (
                  <div className="absolute right-2 top-2">
                    <IconPlayerPlay
                      className="h-5 w-5 text-background drop-shadow-md"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </a>
            ))}
          </div>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
