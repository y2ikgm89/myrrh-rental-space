"use client";

/**
 * LenisProvider — デスクトップ専用スムーススクロール
 *
 * ExperienceShell の簡素化版。Lenis をデスクトップ（min-width: 768px）のみで初期化し、
 * lenis/react の LenisContext を提供して useLenis() との互換性を維持する。
 *
 * - prefers-reduced-motion を尊重
 * - GSAP ticker 統合（Lenis 公式推奨パターン）
 * - ScrollTrigger との同期
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import Lenis from "lenis";
import type { ScrollCallback } from "lenis";
import { LenisContext, type LenisContextValue } from "lenis/react";
import {
  gsap,
  ScrollTrigger,
  prefersReducedMotion,
} from "@/public/lib/gsap-config";

interface LenisStore {
  value: LenisContextValue | null;
  listeners: Set<() => void>;
}

function notifyListeners(store: LenisStore): void {
  for (const listener of store.listeners) {
    listener();
  }
}

interface LenisProviderProps {
  readonly children: ReactNode;
}

export function LenisProvider({ children }: LenisProviderProps) {
  const callbacksRef = useRef<
    Array<{ callback: ScrollCallback; priority: number }>
  >([]);
  const storeRef = useRef<LenisStore>({ value: null, listeners: new Set() });

  const subscribe = (listener: () => void) => {
    storeRef.current.listeners.add(listener);
    return () => {
      storeRef.current.listeners.delete(listener);
    };
  };

  const getSnapshot = (): LenisContextValue | null => {
    return storeRef.current.value;
  };

  const getServerSnapshot = (): LenisContextValue | null => {
    return null;
  };

  const contextValue = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    // デスクトップのみ（モバイルではネイティブスクロールを使用）
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    if (!mediaQuery.matches) return;

    // アクセシビリティ: reduced motion を尊重
    if (prefersReducedMotion()) return;

    const store = storeRef.current;
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      duration: 1.2,
    });

    // ScrollTrigger との同期（Lenis 公式推奨）
    lenis.on("scroll", ScrollTrigger.update);

    // useLenis(callback) で登録されたコールバックを dispatch
    lenis.on("scroll", () => {
      for (let i = 0; i < callbacksRef.current.length; i++) {
        callbacksRef.current[i]?.callback(lenis);
      }
    });

    // GSAP ticker で Lenis の RAF を駆動（Lenis 公式推奨パターン）
    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tickerCallback);
    gsap.ticker.lagSmoothing(0);
    gsap.config({ autoSleep: 0 });

    const addCallback = (callback: ScrollCallback, priority: number) => {
      callbacksRef.current.push({ callback, priority });
      callbacksRef.current.sort((a, b) => a.priority - b.priority);
    };

    const removeCallback = (callback: ScrollCallback) => {
      callbacksRef.current = callbacksRef.current.filter(
        (cb) => cb.callback !== callback,
      );
    };

    store.value = { lenis, addCallback, removeCallback };
    notifyListeners(store);

    // Lenis 初期化後に ScrollTrigger のトリガー位置を再計算
    ScrollTrigger.refresh();

    // 動的コンテンツ（遅延画像・Suspense 解決等）による高さ変化を検知し
    // ScrollTrigger のトリガー位置を自動再計算
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        ScrollTrigger.refresh(true);
      }, 200);
    });
    ro.observe(document.body);

    return () => {
      ro.disconnect();
      if (refreshTimer) clearTimeout(refreshTimer);
      gsap.ticker.remove(tickerCallback);
      lenis.destroy();
      store.value = null;
      notifyListeners(store);
    };
  }, []);

  return <LenisContext value={contextValue}>{children}</LenisContext>;
}
