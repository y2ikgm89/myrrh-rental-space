"use client";

/**
 * HeroBackgroundSlideshow — 全面背景メディアの自動スライドショー
 *
 * hero セクション / page-hero media variant の共有背景描画。複数の画像・動画を
 * クロスフェード（または ken-burns）で切り替える。
 *
 * - 画像 / 埋込スライド: autoPlayInterval 秒で次へ（GSAP delayedCall 駆動、pause/resume 可能）
 * - R2 mp4 スライド: loop を外し再生完了 (onEnded) で次へ + 切替時に先頭巻き戻し
 * - YouTube / Vimeo スライド: 終了検知不可のため autoPlayInterval 秒フォールバック
 * - スライドショー全体でループ（最後 → 最初）
 * - メディア 1 件: 自動送りなし（動画は loop 背景 / 画像は静止）
 * - WCAG 2.2.2: 明示的な再生/停止ボタン + hover 一時停止 + prefers-reduced-motion で自動送りオフ
 *   （reduced-motion は useSyncExternalStore で render に反映、停止コントロールは autoPlay 構成時のみ表示）
 * - GSAP Pattern C（ref + gsap.to / gsap.delayedCall + useMotionPreference + killTweensOf cleanup）
 */

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { VideoPlayer } from "@/public/components/design-system/video-player";
import { DURATION, EASE } from "@/public/lib/animations";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
import { detectVideoProvider } from "@/shared/lib/video/url-detect";
import type { HeroBgTransition } from "@/shared/lib/sections/definitions/_shared/media";

export interface HeroSlideItem {
  readonly url: string;
  readonly alt: string;
  readonly caption: string;
}

interface HeroBackgroundSlideshowProps {
  readonly items: readonly HeroSlideItem[];
  readonly transition: HeroBgTransition;
  readonly autoPlayInterval: number;
  readonly sizes?: string;
  readonly priority?: boolean;
  /**
   * 動画スライドの load 中 / autoplay 失敗時に表示するポスター画像 URL。
   * 全動画スライド共通（schema 上も単一）。空文字なら未指定として扱う。
   */
  readonly posterUrl?: string;
}

type SlideKind = "image" | "video-file" | "video-embed";

function slideKind(url: string): SlideKind {
  if (detectMediaSourceType(url) !== "video") return "image";
  return detectVideoProvider(url).provider === undefined
    ? "video-file"
    : "video-embed";
}

// prefers-reduced-motion を render に反映する購読（React 19 公式パターン、module-scope
// subscriber で参照安定）。`useMotionPreference`（ref）は event-time 読み用だが、
// 自動送りの有効/無効と停止ボタンの表示を render に反映するには reactive state が要る。
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

export function HeroBackgroundSlideshow({
  items,
  transition,
  autoPlayInterval,
  sizes = "100vw",
  priority = false,
  posterUrl,
}: HeroBackgroundSlideshowProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const videoElsRef = useRef<(HTMLVideoElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const advanceCallRef = useRef<ReturnType<typeof gsap.delayedCall> | null>(
    null,
  );
  const isHoveredRef = useRef(false);
  const motionOkRef = useMotionPreference();

  const count = items.length;
  const hasMultiple = count > 1;
  const [activeIndex, setActiveIndex] = useState(0);
  // 自動回転の再生状態（再生ボタンでのみ再開、hover は一過性で isPlaying を変えない）
  const [isPlaying, setIsPlaying] = useState(true);

  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotionSnapshot,
    getReduceMotionServerSnapshot,
  );

  const kinds = items.map((it) => slideKind(it.url));
  // 自動送りが構成上可能か（複数メディア）。reduced-motion / 一時停止は別ゲート。
  const autoRotateConfigured = hasMultiple;
  const autoRotateEnabled = isPlaying && !reduceMotion && autoRotateConfigured;

  const goTo = (nextIndex: number) => {
    const prevIndex = activeIndexRef.current;
    if (prevIndex === nextIndex) return;

    const prevEl = layerElsRef.current[prevIndex];
    const nextEl = layerElsRef.current[nextIndex];
    if (!prevEl || !nextEl) return;

    if (motionOkRef.current) {
      gsap.to(prevEl, {
        opacity: 0,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
      gsap.to(nextEl, {
        opacity: 1,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
      if (transition === "ken-burns" && kinds[nextIndex] === "image") {
        const img = nextEl.firstElementChild;
        if (img) {
          gsap.fromTo(
            img,
            { scale: 1, x: "0%", y: "0%" },
            {
              scale: 1.08,
              x: "2%",
              y: "1%",
              duration: autoPlayInterval,
              ease: EASE.none,
            },
          );
        }
      }
    } else {
      gsap.set(prevEl, { opacity: 0 });
      gsap.set(nextEl, { opacity: 1 });
    }

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  const advance = () => {
    goTo((activeIndexRef.current + 1) % count);
  };

  // アクティブスライド / 再生条件が変わるたびに送りを再スケジュール
  const scheduleActive = useEffectEvent(() => {
    advanceCallRef.current?.kill();
    advanceCallRef.current = null;

    const index = activeIndexRef.current;
    const kind = kinds[index];

    if (!autoRotateEnabled) {
      // 停止中 / reduced-motion: 動画は一時停止して現在地を静止表示
      const video = videoElsRef.current[index];
      if (video && kind === "video-file") video.pause();
      return;
    }

    if (kind === "video-file") {
      // R2 mp4: 先頭から再生し直す。onEnded（JSX 側）で advance する
      const video = videoElsRef.current[index];
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => {
          // autoplay 失敗時は delayedCall フォールバック
          advanceCallRef.current = gsap.delayedCall(autoPlayInterval, advance);
          if (isHoveredRef.current) advanceCallRef.current.pause();
        });
      }
      return;
    }

    // 画像 / YouTube・Vimeo 埋込: GSAP delayedCall で固定秒送り（hover で pause/resume 可能）
    advanceCallRef.current = gsap.delayedCall(autoPlayInterval, advance);
    if (isHoveredRef.current) advanceCallRef.current.pause();
  });

  useEffect(() => {
    scheduleActive();
    return () => {
      advanceCallRef.current?.kill();
      advanceCallRef.current = null;
    };
    // activeIndex / 再生条件 / interval 変化で再スケジュール
  }, [activeIndex, autoRotateEnabled, autoPlayInterval]);

  // アンマウント時の GSAP cleanup（Pattern C 要件）
  useEffect(() => {
    const layers = layerElsRef.current;
    return () => {
      advanceCallRef.current?.kill();
      for (const el of layers) {
        if (el) {
          gsap.killTweensOf(el);
          if (el.firstElementChild) gsap.killTweensOf(el.firstElementChild);
        }
      }
    };
  }, []);

  // ken-burns の初期スライド（最初の画像）のズーム開始
  // （タイマー駆動は mount 時に発火しないため別途 Pattern A で起動）
  useGSAP(
    () => {
      if (transition !== "ken-burns" || !hasMultiple) return;
      if (kinds[0] !== "image") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const img = layerElsRef.current[0]?.firstElementChild;
        if (img) {
          gsap.fromTo(
            img,
            { scale: 1, x: "0%", y: "0%" },
            {
              scale: 1.08,
              x: "2%",
              y: "1%",
              duration: autoPlayInterval,
              ease: EASE.none,
            },
          );
        }
      });
    },
    {
      scope: containerRef,
      dependencies: [transition, hasMultiple, autoPlayInterval],
    },
  );

  const handleVideoEnded = (index: number) => {
    if (
      index === activeIndexRef.current &&
      autoRotateEnabled &&
      !isHoveredRef.current
    ) {
      advance();
    }
  };

  // ホバー中は自動送りを一時停止（離れたら再開、isPlaying は変えない — WCAG 2.2.2）
  const handlePointerEnter = () => {
    if (!autoRotateConfigured) return;
    isHoveredRef.current = true;
    advanceCallRef.current?.pause();
    const video = videoElsRef.current[activeIndexRef.current];
    if (video && kinds[activeIndexRef.current] === "video-file") video.pause();
  };
  const handlePointerLeave = () => {
    if (!autoRotateConfigured) return;
    isHoveredRef.current = false;
    if (!autoRotateEnabled) return;
    advanceCallRef.current?.resume();
    const video = videoElsRef.current[activeIndexRef.current];
    if (video && kinds[activeIndexRef.current] === "video-file") {
      void video.play().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {items.map((item, i) => {
        const kind = kinds[i];
        const isFirst = i === 0;
        return (
          <div
            key={item.url}
            ref={(el) => {
              layerElsRef.current[i] = el;
            }}
            className="absolute inset-0"
            style={{ opacity: isFirst ? 1 : 0 }}
          >
            {kind === "image" ? (
              <Image
                src={item.url}
                alt={i === activeIndex ? item.alt : ""}
                fill
                sizes={sizes}
                className="object-cover"
                preload={priority && isFirst}
                loading={priority && isFirst ? "eager" : "lazy"}
                fetchPriority={priority && isFirst ? "high" : "auto"}
              />
            ) : (
              <VideoPlayer
                url={item.url}
                variant="background"
                loop={kind === "video-embed" ? true : !hasMultiple}
                {...(kind === "video-file" &&
                  posterUrl !== undefined &&
                  posterUrl.length > 0 && { poster: posterUrl })}
                {...(kind === "video-file" && {
                  videoRef: (el: HTMLVideoElement | null) => {
                    videoElsRef.current[i] = el;
                  },
                  onEnded: () => handleVideoEnded(i),
                })}
              />
            )}
          </div>
        );
      })}

      {autoRotateConfigured && !reduceMotion ? (
        <button
          type="button"
          onClick={() => setIsPlaying((prev) => !prev)}
          aria-label={
            isPlaying ? "スライドショーを一時停止" : "スライドショーを再生"
          }
          className="absolute bottom-4 right-4 z-30 inline-flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-full bg-foreground/55 text-background backdrop-blur-sm transition-colors duration-200 hover:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          {isPlaying ? (
            <IconPlayerPauseFilled className="h-4 w-4" aria-hidden="true" />
          ) : (
            <IconPlayerPlayFilled className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
