"use client";

import { useSyncExternalStore } from "react";

/**
 * メディアクエリの状態を監視するフック
 *
 * @param query - メディアクエリ文字列 (例: '(min-width: 1024px)')
 * @returns メディアクエリにマッチしているかどうか
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 1024px)')
 * const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  };

  const getSnapshot = () => {
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => {
    // SSRでは常にfalseを返す（デスクトップ想定）
    return false;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
