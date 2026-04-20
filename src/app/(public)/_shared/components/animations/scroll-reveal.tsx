"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import {
  DURATION,
  EASE,
  SCROLL_TRIGGER,
  STAGGER,
} from "@/public/lib/animations";
import type { ReactNode } from "react";

interface ScrollRevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
}

/**
 * 単一要素のスクロール入場アニメーション。
 *
 * - 1 要素につき 1 ScrollTrigger を作成。Hero / CTA / Section header 等の
 *   少数要素を個別タイミングで入場させる用途向け。
 * - リスト（.map で N 個生成される要素）には {@link ScrollRevealGroup} を使用する
 *   （N ScrollTrigger を作らず、1 ScrollTrigger + stagger に集約）。
 */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          el,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.out,
            delay,
            scrollTrigger: {
              trigger: el,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

interface ScrollRevealGroupProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** 子要素間のスタガー秒数。デフォルト: {@link STAGGER.element} */
  readonly stagger?: number;
}

/**
 * リスト用スクロール入場アニメーション（GSAP 公式推奨パターン）。
 *
 * コンテナに 1 ScrollTrigger を設定し、直接の子要素を `stagger` で順次入場させる。
 * コンテナ上端が viewport 85% に到達した時点で、たとえ後続カードが fold 外にあっても
 * すべての子要素が連続して発火するため「1 個目しか見えない」問題が発生しない。
 *
 * @example
 * <ScrollRevealGroup className="grid grid-cols-1 gap-10 sm:grid-cols-2">
 *   {items.map((item) => <Card key={item.id} {...item} />)}
 * </ScrollRevealGroup>
 */
export function ScrollRevealGroup({
  children,
  className = "",
  stagger = STAGGER.element,
}: ScrollRevealGroupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = ref.current;
      if (!container) return;
      const items = Array.from(container.children);
      if (items.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          items,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.out,
            stagger,
            scrollTrigger: {
              trigger: container,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
