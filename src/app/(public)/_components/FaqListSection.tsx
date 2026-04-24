"use client";

/**
 * FaqListSection — FAQ accordion with details/summary
 *
 * Zero JS accessibility via native <details>/<summary>.
 * Variant: default (bordered +/-), bordered (card shadow), minimal (separator line).
 * Optional FAQ JSON-LD for schema.org FAQPage.
 */

import { useRef, type ReactElement } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
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
import { toAppRoute } from "@/shared/lib/typed-routes";

export interface FaqData {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

interface FaqListSectionProps {
  readonly config: FaqListConfig;
  readonly items: readonly FaqData[];
  readonly style: SectionStylePayload;
}

const VARIANT_STYLES = {
  default: {
    container: "divide-y divide-border",
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
    container: "divide-y divide-border/50",
    item: "py-4 first:pt-0 last:pb-0",
    summary:
      "flex w-full cursor-pointer items-center justify-between gap-4 text-left text-sm font-light md:text-base [&::marker]:content-none [&::-webkit-details-marker]:hidden",
    marker: false,
  },
} as const;

export function FaqListSection({
  config,
  items,
  style,
}: FaqListSectionProps): ReactElement {
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

  if (items.length === 0) return <></>;

  const styles = VARIANT_STYLES[config.variant] ?? VARIANT_STYLES.default;
  const containerWidth =
    CONTAINER_WIDTH_MAP[parseContainerWidth(config.containerWidth)];
  const initialOpen = parseFaqInitialOpen(config.initialOpen);

  return (
    <>
      <SectionWrapper style={style}>
        <div className={cn("mx-auto", containerWidth)}>
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
                <SplitText>{config.title}</SplitText>
              </Heading>
            </div>
          </div>

          <div ref={listRef} className={styles.container}>
            {items.map((item, index) => (
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

          {config.showViewAllLink && (
            <ScrollReveal delay={0.2}>
              <div className="mt-8 text-center">
                <Link
                  href={toAppRoute(config.viewAllUrl)}
                  className="group relative inline-block text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {config.viewAllText} &rarr;
                  <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
                </Link>
              </div>
            </ScrollReveal>
          )}
        </div>
      </SectionWrapper>

      {/* FAQ JSON-LD — Unicode-escape < > & to prevent script injection (same pattern as JsonLd.tsx) */}
      {/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify + Unicode-escaped, safe for structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
              },
            })),
          })
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
      {/* eslint-enable @eslint-react/dom-no-dangerously-set-innerhtml */}
    </>
  );
}
