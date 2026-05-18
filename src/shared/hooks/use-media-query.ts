"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR snapshot をモジュール定数化して参照安定性を保証
 * (React 公式 useSyncExternalStore 規約: getServerSnapshot の戻り値は呼び出し間で参照固定)
 */
const SERVER_SNAPSHOT = false;
function getServerSnapshot(): boolean {
  return SERVER_SNAPSHOT;
}

/**
 * メディアクエリの状態を監視するフック
 *
 * @param query - メディアクエリ文字列 (例: '(min-width: 1024px)')
 * @returns メディアクエリにマッチしているかどうか
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 1024px)')
 * const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
 *
 * @remarks
 * `subscribe` / `getSnapshot` は毎レンダ新規生成だが、React 公式
 * `useSyncExternalStore` 仕様で「subscribe 参照変化時に再 subscribe」が
 * 保証されているため機能上問題なし。query 動的変更にも自動追従する。
 * パフォーマンス的には listener が連続 add/remove される副作用があるが、
 * matchMedia は軽量で実害なし。
 * (ESLint `no-restricted-imports` で `useCallback` 全面禁止のため
 * 公式例外パターンは disable comment 不使用で素直に実装)
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  };

  const getSnapshot = () => window.matchMedia(query).matches;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
