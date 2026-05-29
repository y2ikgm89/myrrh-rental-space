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
 * `subscribe` / `getSnapshot` を query 文字列キーで module-level cache する。
 *
 * `useSyncExternalStore` は `subscribe` の参照が変化するたびに再 subscribe
 * (removeEventListener + addEventListener) するため、フック内で毎レンダ新規生成すると
 * 親の再レンダのたびに matchMedia listener が付け外しされる無駄が生じる。
 * query ごとに 1 度だけ生成して参照を固定することで再 subscribe を防ぐ
 * (React Compiler 互換 — useCallback 不使用、ESLint no-restricted-imports と非衝突)。
 */
const subscribeCache = new Map<string, (callback: () => void) => () => void>();
const snapshotCache = new Map<string, () => boolean>();

function getSubscribe(query: string): (callback: () => void) => () => void {
  const cached = subscribeCache.get(query);
  if (cached) return cached;
  const subscribe = (callback: () => void): (() => void) => {
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  };
  subscribeCache.set(query, subscribe);
  return subscribe;
}

function getSnapshotFor(query: string): () => boolean {
  const cached = snapshotCache.get(query);
  if (cached) return cached;
  const getSnapshot = (): boolean => window.matchMedia(query).matches;
  snapshotCache.set(query, getSnapshot);
  return getSnapshot;
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
 * `subscribe` / `getSnapshot` は query キーで module-level cache し参照を固定する
 * (上記 §cache 参照)。query 動的変更時はキーが変わり新しい安定参照に切り替わる。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    getSubscribe(query),
    getSnapshotFor(query),
    getServerSnapshot,
  );
}
