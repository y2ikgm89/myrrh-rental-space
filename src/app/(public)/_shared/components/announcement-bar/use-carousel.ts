import { useState, useEffect } from "react";
import type { AnnouncementBarItem } from "./types";

interface UseCarouselOptions {
  bars: readonly AnnouncementBarItem[];
  autoPlay: boolean;
  duration: number;
  isPaused: boolean;
}

interface UseCarouselReturn {
  currentIndex: number;
  currentBar: AnnouncementBarItem | undefined;
  isTransitioning: boolean;
  onAnimationEnd: () => void;
  goNext: () => void;
  goPrev: () => void;
  total: number;
}

export function useCarousel({
  bars,
  autoPlay,
  duration,
  isPaused,
}: UseCarouselOptions): UseCarouselReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track previous bar ID in state so we can derive isTransitioning without
  // calling setState inside a useEffect body (react-hooks/set-state-in-effect).
  const [prevBarId, setPrevBarId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const total = bars.length;
  const safeIndex = total === 0 ? 0 : currentIndex >= total ? 0 : currentIndex;
  const currentBar = bars[safeIndex];

  const currentBarId = currentBar?.id ?? null;

  // Detect bar changes via event handler-style setState (not inside effect body).
  // We store the previous ID in state; when it differs from currentBarId we
  // start the transition animation. The setter is called in the render phase
  // only when the IDs differ, which is the recommended "state derived from
  // previous render" pattern (React docs: "Adjusting state based on props or state").
  if (
    prevBarId !== null &&
    currentBarId !== null &&
    prevBarId !== currentBarId
  ) {
    setPrevBarId(currentBarId);
    setTransitioning(true);
  } else if (prevBarId === null && currentBarId !== null) {
    setPrevBarId(currentBarId);
  }

  useEffect(() => {
    if (!autoPlay || isPaused || total <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, duration);
    return () => clearInterval(timer);
  }, [autoPlay, duration, isPaused, total]);

  const goNext = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const goPrev = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const onAnimationEnd = () => setTransitioning(false);

  return {
    currentIndex: safeIndex,
    currentBar,
    isTransitioning: transitioning,
    onAnimationEnd,
    goNext,
    goPrev,
    total,
  };
}
