"use client";

/**
 * FaqListSection — FAQ accordion with details/summary
 *
 * Zero JS accessibility via native <details>/<summary>.
 * Variant: default (bordered +/-), bordered (card shadow), minimal (separator line).
 * Optional FAQ JSON-LD for schema.org FAQPage.
 */

/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify + Unicode-escaped (< / > / &), safe for structured data */

import {
  useRef,
  useState,
  type ReactElement,
  type SyntheticEvent,
} from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import { CONTAINER_WIDTH_MAP } from "@/public/lib/section-style-maps";
import { Heading } from "@/public/components/design-system/heading";
import { cn } from "@/shared/lib/cn";
import {
  parseContainerWidth,
  parseFaqInitialOpen,
} from "@/shared/lib/validations/section-parsers";
import type { FaqListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type { PublicFaqCategoryWithItems } from "@/shared/domain/sections/queries";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { FaqHelpfulVote } from "../faq/_components/faq-helpful-vote";
import { FaqViewTracker } from "../faq/_components/faq-view-tracker";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";

export interface FaqData {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

interface FaqListSectionProps {
  readonly config: FaqListConfig;
  readonly style: SectionStylePayload;
  readonly items?: readonly FaqData[];
  readonly categories?: readonly PublicFaqCategoryWithItems[];
}

const VARIANT_STYLES = {
  default: {
    container: "divide-y divide-divider",
    item: "py-4 first:pt-0 last:pb-0",
    summary:
      "flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-light md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden",
    marker: true,
  },
  bordered: {
    container: "space-y-3",
    item: "border border-border p-4 transition-colors duration-200",
    summary:
      "flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-light md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden",
    marker: true,
  },
  minimal: {
    container: "divide-y divide-divider/60",
    item: "py-4 first:pt-0 last:pb-0",
    summary:
      "flex w-full cursor-pointer items-center justify-between gap-4 text-left text-sm font-light md:text-base [&::marker]:content-none [&::-webkit-details-marker]:hidden",
    marker: false,
  },
} as const;

function FaqAccordionItem({
  item,
  defaultOpen,
  styles,
}: {
  readonly item: PublicFaqCategoryWithItems["items"][number];
  readonly defaultOpen: boolean;
  readonly styles: (typeof VARIANT_STYLES)[keyof typeof VARIANT_STYLES];
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  return (
    <>
      <details
        data-faq-item=""
        className={cn("group", styles.item)}
        {...(defaultOpen && { open: true })}
        onToggle={handleToggle}
      >
        <summary className={styles.summary}>
          <span>{item.question}</span>
          {styles.marker && (
            <span
              className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </span>
          )}
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {item.answer}
        </p>
        <FaqHelpfulVote
          id={item.id}
          helpfulCount={item.helpfulCount}
          notHelpfulCount={item.notHelpfulCount}
        />
      </details>
      <FaqViewTracker id={item.id} open={open} />
    </>
  );
}

export function FaqListSection({
  config,
  style,
  items,
  categories,
}: FaqListSectionProps): ReactElement | null {
  const listRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const list = listRef.current;
      if (!list) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const faqItems = list.querySelectorAll("[data-faq-item]");
        if (faqItems.length === 0) return;

        gsap.fromTo(
          faqItems,
          { y: 20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.outQuart,
            stagger: STAGGER.element * 0.6,
            scrollTrigger: {
              trigger: list,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: listRef },
  );

  const styles = VARIANT_STYLES[config.variant] ?? VARIANT_STYLES.default;
  const containerWidth =
    CONTAINER_WIDTH_MAP[parseContainerWidth(config.layout.containerWidth)];
  const initialOpen = parseFaqInitialOpen(config.initialOpen);

  const categoriesData = categories ?? [];
  const flatItemsData = items ?? [];
  const useCategoryMode = categoriesData.length > 0;
  const flatJsonLdItems: readonly { question: string; answer: string }[] =
    useCategoryMode
      ? categoriesData.flatMap((c) =>
          c.items.map((i) => ({ question: i.question, answer: i.answer })),
        )
      : flatItemsData.map((i) => ({ question: i.question, answer: i.answer }));

  if (!useCategoryMode && flatItemsData.length === 0) return null;

  const jsonLdHtml =
    flatJsonLdItems.length === 0
      ? null
      : JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: flatJsonLdItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026");

  return (
    <>
      <SectionWrapper style={style} layout={config.layout}>
        <div className={cn("mx-auto", containerWidth)}>
          {config.title.length > 0 && (
            <div className="mb-10 text-center md:mb-14">
              {config.sectionLabel && (
                <ScrollReveal>
                  <SectionLabel>{config.sectionLabel}</SectionLabel>
                </ScrollReveal>
              )}
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn(
                    "mt-4",
                    getTitleClasses(style),
                    "tracking-tight",
                  )}
                >
                  <SplitText>
                    <PortableTextSpans spans={config.title} />
                  </SplitText>
                </Heading>
              </div>
            </div>
          )}

          {useCategoryMode ? (
            <div ref={listRef} className="space-y-16">
              {categoriesData.map((category, categoryIndex) => (
                <section
                  key={category.id}
                  aria-labelledby={`faq-category-${category.id}`}
                  className="space-y-6"
                >
                  <header className="border-b border-border pb-3">
                    <h3
                      id={`faq-category-${category.id}`}
                      className="flex items-center gap-3 font-heading text-xl font-light tracking-[0.02em] text-foreground md:text-2xl"
                    >
                      {category.iconEmoji && (
                        <span className="text-2xl" aria-hidden="true">
                          {category.iconEmoji}
                        </span>
                      )}
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </header>

                  <div className="divide-y divide-divider">
                    {category.items.map((item, itemIndex) => (
                      <FaqAccordionItem
                        key={item.id}
                        item={item}
                        defaultOpen={
                          initialOpen === "all" ||
                          (initialOpen === "first" &&
                            categoryIndex === 0 &&
                            itemIndex === 0)
                        }
                        styles={styles}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div ref={listRef} className={styles.container}>
              {flatItemsData.map((item, index) => (
                <details
                  key={item.id}
                  data-faq-item=""
                  className={cn("group", styles.item)}
                  open={
                    initialOpen === "all" ||
                    (initialOpen === "first" && index === 0)
                  }
                >
                  <summary className={styles.summary}>
                    <span>{item.question}</span>
                    {styles.marker && (
                      <span
                        className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                        aria-hidden="true"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </span>
                    )}
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          )}

          {config.showViewAllLink && (
            <ScrollReveal delay={0.2}>
              <div className="mt-8 text-center">
                <Link
                  href={toAppRoute(config.viewAllUrl)}
                  className="group relative inline-block text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <PortableTextSpans spans={config.viewAllText} />
                  <span aria-hidden="true">{" →"}</span>
                  <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
                </Link>
              </div>
            </ScrollReveal>
          )}
        </div>
      </SectionWrapper>

      {jsonLdHtml ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
        />
      ) : null}
    </>
  );
}
