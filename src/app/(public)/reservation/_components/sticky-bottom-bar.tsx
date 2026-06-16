"use client";

import { useEffect, useRef, type ReactNode, type ReactElement } from "react";

interface StickyBottomBarProps {
  readonly children: ReactNode;
}

/**
 * StickyBottomBar — モバイル予約フローの下部固定 CTA バー。
 *
 * iOS Safari / Android Chrome はソフトキーボード表示時に visual viewport のみ
 * 縮小し layout viewport は縮まないため（interactive-widget=resizes-visual・
 * iOS は常にこの挙動）、position:fixed の本バーはそのまま留まりキーボードに
 * 覆われて送信 CTA が押せなくなる。visualViewport API でキーボードの高さ分だけ
 * バーを押し上げ、常にキーボードの上に表示する（Chrome 公式の keyboard-aware 手法）。
 */
export function StickyBottomBar({
  children,
}: StickyBottomBarProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;

    const update = () => {
      // layout viewport（window.innerHeight）から visual viewport を引いた差分が
      // ソフトキーボードの占有高。その分だけバーを上へ移動する。
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      el.style.transform = overlap > 1 ? `translateY(-${overlap}px)` : "";
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom,0px))] z-40 border-t border-border bg-background/95 px-[var(--container-padding)] pb-3 pt-3 backdrop-blur-sm transition-transform duration-150 md:hidden"
    >
      {children}
    </div>
  );
}
