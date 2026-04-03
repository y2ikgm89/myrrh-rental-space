"use client";

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";

export interface HeroSectionProps {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly buttonText: string;
  readonly buttonUrl: string;
}

export const heroDefaultProps: HeroSectionProps = {
  label: "Volume One — Spring 2026",
  title: "Where silence works.",
  description:
    "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
  imageUrl:
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  imageAlt: "自然光が差し込む開放的なレンタルスペース",
  buttonText: "Explore spaces",
  buttonUrl: "/spaces",
};

export function HomepageHero({
  label = heroDefaultProps.label,
  title = heroDefaultProps.title,
  description = heroDefaultProps.description,
  imageUrl = heroDefaultProps.imageUrl,
  imageAlt = heroDefaultProps.imageAlt,
  buttonText = heroDefaultProps.buttonText,
  buttonUrl = heroDefaultProps.buttonUrl,
}: Partial<HeroSectionProps> = {}): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          contentRef.current,
          { opacity: 0, y: REVEAL.fadeUp.y },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.3,
          },
        );
      });
    },
    { scope: contentRef },
  );

  return (
    <section
      className="grid min-h-[85vh] grid-cols-1 md:grid-cols-2"
      data-hero=""
    >
      <div className="relative min-h-[50vh] overflow-hidden bg-surface md:min-h-0">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
        <span className="absolute bottom-4 left-4 text-[0.55rem] uppercase tracking-[0.15em] text-background/50">
          Photography — Myrrh Studio, 2026
        </span>
      </div>

      <div
        ref={contentRef}
        className="flex flex-col justify-center bg-background px-6 py-12 md:px-12 md:py-16 lg:px-16"
      >
        <p className="mb-8 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground md:mb-12">
          {label}
        </p>

        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          <SplitText trigger={false} delay={0.5}>
            {title}
          </SplitText>
        </h1>

        <div className="mt-6 h-px w-12 bg-accent md:mt-8" aria-hidden="true" />

        <ScrollReveal delay={0.3}>
          <p className="mt-6 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground md:mt-8 md:text-base">
            {description}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <Link
            href={buttonUrl}
            className="group mt-8 inline-flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.15em] text-foreground transition-[gap] duration-300 hover:gap-5 md:mt-10"
          >
            {buttonText}
            <span className="h-px w-8 bg-foreground transition-[width] duration-300 group-hover:w-12" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
