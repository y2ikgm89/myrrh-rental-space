"use client";

import { useState, useEffect, useSyncExternalStore, useRef } from "react";
import Link from "next/link";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { isAppRoute } from "@/shared/lib/typed-routes";
import { AnnouncementBarDesignStyle } from "@/shared/lib/validations/enums/prisma-types";
import { useCarousel } from "./use-carousel";
import { useDismissedBars, dismissBar } from "./use-dismissed-bars";
import { computeBarStyles, getTransitionAnimation } from "./styles";
import type { AnnouncementBarItem, CarouselSettings } from "./types";

function isWithinDisplayPeriod(bar: AnnouncementBarItem): boolean {
  const now = new Date();
  const startAt = bar.startAt ? new Date(bar.startAt) : null;
  const endAt = bar.endAt ? new Date(bar.endAt) : null;
  if (!startAt && !endAt) return true;
  if (startAt && !endAt) return now >= startAt;
  if (!startAt && endAt) return now <= endAt;
  return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
}

// prefers-reduced-motion を render に反映する購読（React 19 公式パターン、module-scope
// subscriber で参照安定）。自動回転の停止と停止ボタンの表示を render に反映する。
function subscribeReduceMotion(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReduceMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReduceMotionServerSnapshot(): boolean {
  return false;
}

interface AnnouncementBarProps {
  readonly bars: AnnouncementBarItem[];
  readonly settings: CarouselSettings;
}

export function AnnouncementBar({ bars, settings }: AnnouncementBarProps) {
  // 自動回転の再生状態（再生ボタン / focus 侵入で制御）と hover 一過性停止を分離
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissedIds = useDismissedBars();

  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotionSnapshot,
    getReduceMotionServerSnapshot,
  );

  const visibleBars = bars.filter(
    (bar) => !dismissedIds.includes(bar.id) && isWithinDisplayPeriod(bar),
  );

  // 自動回転の停止条件（WCAG 2.2.2）: 明示停止 / reduced-motion / hover（pauseOnHover 設定時）
  const isPaused =
    !isPlaying || reduceMotion || (settings.pauseOnHover && isHovered);

  const {
    currentIndex,
    currentBar,
    isTransitioning,
    onAnimationEnd,
    goNext,
    goPrev,
    total,
  } = useCarousel({
    bars: visibleBars,
    autoPlay: settings.autoPlay,
    duration: settings.duration,
    isPaused,
  });

  // Sticky: publish height as CSS custom property
  useEffect(() => {
    if (!settings.sticky) return;
    const el = containerRef.current;
    if (!el) return;

    if (visibleBars.length === 0) {
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        "0px",
      );
      return;
    }

    const update = () => {
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        "0px",
      );
    };
  }, [settings.sticky, visibleBars.length]);

  if (visibleBars.length === 0 || !currentBar) return null;

  const { className, style, linkHoverClass, hasCustomText } =
    computeBarStyles(settings);
  const showNav = total > 1;
  // 自動回転が実際に進行中か（aria-live の off/polite 切替）。停止コントロールは
  // autoPlay 構成 + 複数 + reduced-motion でない場合のみ表示（reduced-motion 時は
  // そもそも自動送りが起きないため停止ボタンは不要）。
  const autoRotating = settings.autoPlay && showNav && !isPaused;
  const showPlayPause = settings.autoPlay && showNav && !reduceMotion;

  // CTA リンク用の派生値（typedoc の narrowing を JSX 外で確定させる）
  const linkUrl = currentBar.linkUrl;
  const linkText = currentBar.linkText;
  const isExternalLink = linkUrl != null && linkUrl.startsWith("http");
  // hasCustomText が false (= default style) なら明示的に text-white を当てて
  // Lighthouse の OKLCH → sRGB conversion 罠を回避 (親 inherit ではなく直接適用)。
  const linkClassName = cn(
    "ml-1 whitespace-nowrap underline underline-offset-2 transition-colors",
    !hasCustomText && "text-white",
    linkHoverClass,
  );
  const messageSpanClassName = cn("min-w-0", !hasCustomText && "text-white");

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      role="region"
      aria-live={autoRotating ? "off" : "polite"}
      aria-label="お知らせ"
      onMouseEnter={() => settings.pauseOnHover && setIsHovered(true)}
      onMouseLeave={() => settings.pauseOnHover && setIsHovered(false)}
      onFocusCapture={() => setIsPlaying(false)}
    >
      {/* Glass shimmer overlay */}
      {settings.designStyle === AnnouncementBarDesignStyle.glass &&
        settings.glassAnimation && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-card/20 to-transparent"
              style={{ animation: "glass-shimmer 3s ease-in-out infinite" }}
            />
          </div>
        )}

      {/* Prev arrow — WCAG 2.5.5 Enhanced 44×44px hit area */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goPrev}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            !hasCustomText && "hover:bg-foreground/10",
          )}
          aria-label="前のお知らせ"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Content with CSS animation — flex-1 で残余幅を占有し、コントロールは
       * shrink-0 で in-flow 配置。テキストは折り返し可（重なり構造的に不可、
       * バー高さは ResizeObserver が再計算）。 */}
      <div className="flex min-h-[1.5rem] min-w-0 flex-1 items-center justify-center overflow-hidden">
        <div
          className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center"
          style={
            isTransitioning
              ? { animation: getTransitionAnimation(settings.animation) }
              : undefined
          }
          onAnimationEnd={onAnimationEnd}
        >
          <span className={messageSpanClassName}>
            <PortableTextSpans
              spans={currentBar.message}
              iconClassName="mr-1.5 inline-block h-4 w-4 align-[-0.125em]"
            />
          </span>
          {linkUrl != null &&
            linkText != null &&
            (isAppRoute(linkUrl) ? (
              <Link href={linkUrl} className={linkClassName}>
                {linkText}
              </Link>
            ) : (
              <a
                href={linkUrl}
                className={linkClassName}
                target={isExternalLink ? "_blank" : undefined}
                rel={isExternalLink ? "noreferrer" : undefined}
              >
                {linkText}
              </a>
            ))}
        </div>
      </div>

      {/* Indicator — flex フローで text と next arrow の間に配置（in-flow のため
       * overlap 不可、shrink-0 で潰れ防止、tabular-nums で桁幅安定）。狭い
       * モバイル幅では装飾 indicator を隠して message の折返しを抑制（hidden
       * sm:inline-block、decorative なので情報欠落なし）。カルーセル位置は
       * aria-live message 切替で伝達されるため aria-hidden で AT redundancy
       * 排除。decorative のため pointer-events-none。 */}
      {settings.showIndicator && showNav && (
        <span
          aria-hidden="true"
          className="pointer-events-none hidden shrink-0 text-xs tabular-nums sm:inline-block"
        >
          {currentIndex + 1}/{total}
        </span>
      )}

      {/* Next arrow — WCAG 2.5.5 Enhanced 44×44px hit area。flex in-flow + gap で
       * 隣接 button と非重複（partially obscured 違反を構造的に回避）。 */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goNext}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            !hasCustomText && "hover:bg-foreground/10",
          )}
          aria-label="次のお知らせ"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Play/Pause — WCAG 2.2.2 (Pause, Stop, Hide) の明示的な停止/再生コントロール。
       * autoPlay 構成かつ複数件のときのみ表示（reduced-motion 時は自動送り自体が
       * 起きないため非表示）。in-flow shrink-0 で隣接コントロールと非重複。 */}
      {showPlayPause && (
        <button
          type="button"
          onClick={() => setIsPlaying((prev) => !prev)}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            !hasCustomText && "hover:bg-foreground/10",
          )}
          aria-label={
            isPlaying
              ? "お知らせの自動切替を一時停止"
              : "お知らせの自動切替を再生"
          }
        >
          {isPlaying ? (
            <IconPlayerPauseFilled className="h-4 w-4" />
          ) : (
            <IconPlayerPlayFilled className="h-4 w-4" />
          )}
        </button>
      )}

      {/* Dismiss — WCAG 2.5.5 Enhanced 44×44px hit area */}
      <button
        type="button"
        onClick={() => dismissBar(currentBar.id)}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
          !hasCustomText && "hover:bg-foreground/10",
        )}
        aria-label="閉じる"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
