"use client";

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";

interface FaqItemData {
  readonly id: string;
  readonly question: string;
  readonly answerHtml: string;
}

interface FaqAccordionProps {
  readonly items: readonly FaqItemData[];
}

export function FaqAccordion({ items }: FaqAccordionProps): ReactElement {
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

  if (items.length === 0) {
    return (
      <p className="py-[var(--spacing-block)] text-center text-muted-foreground">
        現在公開中のよくある質問はありません。
      </p>
    );
  }

  // NOTE: answerHtml is admin-managed sanitized content from Lexical editor
  return (
    <div ref={listRef} className="divide-y divide-border">
      {items.map((item, index) => (
        <details
          key={item.id}
          data-faq-item=""
          className="group py-4 first:pt-0 last:pb-0"
          open={index === 0}
        >
          <summary className="flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-medium md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
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
          </summary>
          <SanitizedHtml
            html={item.answerHtml}
            className="mt-3 text-sm leading-relaxed text-muted-foreground"
          />
        </details>
      ))}
    </div>
  );
}
