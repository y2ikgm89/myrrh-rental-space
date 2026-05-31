"use client";

/**
 * HeroBackgroundSlideshow — 全面背景メディアの自動スライドショー
 *
 * hero セクション / page-hero media variant の共有背景描画。複数の画像・動画を
 * クロスフェード（または ken-burns）で切り替える。
 *
 * - 画像スライド: autoPlayInterval 秒で次へ
 * - R2 mp4 スライド: loop を外し再生完了 (onEnded) で次へ + 切替時に先頭巻き戻し
 * - YouTube / Vimeo スライド: 終了検知不可のため autoPlayInterval 秒フォールバック
 * - スライドショー全体でループ（最後 → 最初）
 * - メディア 1 件: 自動送りなし（動画は loop 背景 / 画像は静止）
 * - prefers-reduced-motion: 先頭スライドのみ静止表示、自動送りなし
 * - GSAP Pattern C（ref + gsap.to + useMotionPreference + killTweensOf cleanup）
 */

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactElement,
} from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
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
}

type SlideKind = "image" | "video-file" | "video-embed";

function slideKind(url: string): SlideKind {
  if (detectMediaSourceType(url) !== "video") return "image";
  return detectVideoProvider(url).provider === undefined
    ? "video-file"
    : "video-embed";
}

export function HeroBackgroundSlideshow({
  items,
  transition,
  autoPlayInterval,
  sizes = "100vw",
  priority = false,
}: HeroBackgroundSlideshowProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const videoElsRef = useRef<(HTMLVideoElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionOkRef = useMotionPreference();

  const count = items.length;
  const hasMultiple = count > 1;
  const [activeIndex, setActiveIndex] = useState(0);

  const kinds = items.map((it) => slideKind(it.url));

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

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

  // アクティブスライドが変わるたびに送りタイミングを再スケジュール
  const scheduleActive = useEffectEvent(() => {
    clearTimer();
    if (!hasMultiple || !motionOkRef.current) return;

    const index = activeIndexRef.current;
    const kind = kinds[index];

    if (kind === "video-file") {
      // R2 mp4: 先頭から再生し直す。onEnded（JSX 側）で advance する
      const video = videoElsRef.current[index];
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => {
          // autoplay 失敗時は interval フォールバック
          timerRef.current = setTimeout(advance, autoPlayInterval * 1000);
        });
      }
      return;
    }

    // 画像 / YouTube・Vimeo 埋込: 固定秒で送る
    timerRef.current = setTimeout(advance, autoPlayInterval * 1000);
  });

  useEffect(() => {
    scheduleActive();
    return clearTimer;
    // activeIndex 変化で再スケジュール
  }, [activeIndex, hasMultiple, autoPlayInterval]);

  // アンマウント時の GSAP cleanup（Pattern C 要件）
  useEffect(() => {
    const layers = layerElsRef.current;
    return () => {
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
    if (index === activeIndexRef.current) advance();
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
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
                priority={priority && isFirst}
              />
            ) : (
              <VideoPlayer
                url={item.url}
                variant="background"
                loop={kind === "video-embed" ? true : !hasMultiple}
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
    </div>
  );
}
