"use client";

/**
 * Public FAQ Accordion — カテゴリグループ化された accordion
 *
 * 業界標準パターン（Apple Support / Stripe / Shopify FAQ）:
 * - カテゴリ見出し + その配下にアコーディオン項目
 * - カテゴリごとに絵文字アイコン表示（オプション）
 * - 最初のカテゴリの最初の項目のみデフォルト開
 * - GSAP で scroll reveal
 * - `<details>` + `<summary>` で native disclosure、WAI-ARIA 自動対応
 *
 * 参照:
 * - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
 * - https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
 */

import {
  useRef,
  useState,
  type ReactElement,
  type SyntheticEvent,
} from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import type { PublicFaqCategoryWithItems } from "@/shared/domain/sections/queries";
import { FaqHelpfulVote } from "./faq-helpful-vote";
import { FaqViewTracker } from "./faq-view-tracker";

interface FaqAccordionProps {
  readonly categories: readonly PublicFaqCategoryWithItems[];
}

export function FaqAccordion({ categories }: FaqAccordionProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const faqItems = root.querySelectorAll("[data-faq-item]");
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
              trigger: root,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: rootRef },
  );

  if (categories.length === 0) {
    return (
      <p className="py-[var(--spacing-block)] text-center text-muted-foreground">
        現在公開中のよくある質問はありません。
      </p>
    );
  }

  return (
    <div ref={rootRef} className="space-y-16">
      {categories.map((category, categoryIndex) => (
        <section
          key={category.id}
          aria-labelledby={`faq-category-${category.id}`}
          className="space-y-6"
        >
          <header className="border-b border-border pb-3">
            <h2
              id={`faq-category-${category.id}`}
              className="flex items-center gap-3 font-heading text-xl font-light tracking-[0.02em] text-foreground md:text-2xl"
            >
              {category.iconEmoji && (
                <span className="text-2xl" aria-hidden="true">
                  {category.iconEmoji}
                </span>
              )}
              {category.name}
            </h2>
            {category.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {category.description}
              </p>
            )}
          </header>

          <div className="divide-y divide-border">
            {category.items.map((item, itemIndex) => (
              <FaqAccordionItem
                key={item.id}
                item={item}
                defaultOpen={categoryIndex === 0 && itemIndex === 0}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FaqAccordionItem({
  item,
  defaultOpen,
}: {
  readonly item: PublicFaqCategoryWithItems["items"][number];
  readonly defaultOpen: boolean;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    setOpen(e.currentTarget.open);
  };

  return (
    <>
      <details
        data-faq-item=""
        className="group py-4 first:pt-0 last:pb-0"
        {...(defaultOpen && { open: true })}
        onToggle={handleToggle}
      >
        <summary className="flex w-full cursor-pointer items-center justify-between gap-4 text-left font-heading text-base font-light md:text-lg [&::marker]:content-none [&::-webkit-details-marker]:hidden">
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
