"use client";

import { useEffect, useState } from "react";
import { scrollToElementById } from "@/public/lib/scroll";

interface ArticleTocScrollSpyProps {
  readonly ids: readonly string[];
}

/**
 * 記事目次（Reading Map）のスクロールスパイ。React 19 + Compiler 1.0 対応。
 *
 * ## 責務
 *
 * - `IntersectionObserver` で `<article>` 内の h2 / h3 を監視し、最も上端に近いものを active 化
 * - active 見出しの TOC リンクに `aria-current="location"` を付与（W3C ARIA 1.2 仕様）
 * - TOC リンククリックを乗っ取り `scrollToElementById()` で固定ヘッダー高さ補正
 * - URL hash を `history.pushState` で更新（戻るボタンで元の見出しに戻れる）
 *
 * ## 設計判断
 *
 * - DOM 操作は副作用として `useEffect` 内で実行（React Compiler 1.0 互換）
 * - `useCallback` / `useMemo` 不使用（Compiler 自動メモ化）
 * - `rootMargin: "-15% 0px -70% 0px"` で viewport 上端 15-30% を「active zone」に設定
 *   → ユーザーがちょうど読んでいる位置と直感的に一致する業界標準パターン
 */
export function ArticleTocScrollSpy({ ids }: ArticleTocScrollSpyProps): null {
  const [activeId, setActiveId] = useState<string>("");

  // active 状態を TOC リンクに反映（aria-current="location" の付与・除去）
  useEffect(() => {
    const links =
      document.querySelectorAll<HTMLAnchorElement>("a[data-toc-link]");
    for (const link of links) {
      if (link.dataset["tocLink"] === activeId) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }, [activeId]);

  // IntersectionObserver でスクロール追従
  useEffect(() => {
    if (ids.length === 0) return;

    const elements: HTMLElement[] = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    const visible = new Map<string, number>(); // id -> top position

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target;
          if (!(target instanceof HTMLElement)) continue;
          if (entry.isIntersecting) {
            visible.set(target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(target.id);
          }
        }

        if (visible.size > 0) {
          // 画面上端に最も近い見出しを active に
          let topMost = "";
          let topMostValue = Number.POSITIVE_INFINITY;
          for (const [id, top] of visible.entries()) {
            if (top < topMostValue) {
              topMost = id;
              topMostValue = top;
            }
          }
          setActiveId(topMost);
        }
      },
      {
        // viewport 上端 15% から下 30% までを active zone として扱う
        rootMargin: "-15% 0px -70% 0px",
        threshold: 0,
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  // TOC アンカークリックを固定ヘッダー高さ補正付き smooth scroll に置換
  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[data-toc-link]");
      if (!anchor) return;
      const id = anchor.dataset["tocLink"];
      if (!id) return;
      event.preventDefault();
      scrollToElementById(id);
      history.pushState(null, "", `#${id}`);
      setActiveId(id);
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return null;
}
