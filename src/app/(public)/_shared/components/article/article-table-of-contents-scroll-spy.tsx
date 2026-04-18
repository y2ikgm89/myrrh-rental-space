"use client";

import { useEffect, useState } from "react";
import { scrollToElementById } from "@/public/lib/scroll";

interface ArticleTableOfContentsScrollSpyProps {
  readonly ids: readonly string[];
}

/**
 * TOC サイドバーのスクロールスパイ（React 19 / Compiler 1.0 対応）。
 *
 * - `IntersectionObserver` で DOM 上の heading を監視し、最も近いエントリをアクティブ化
 * - アクティブ見出しの TOC リンクに `aria-current="location"` を付与（CSS セレクタで装飾）
 * - TOC リンククリックで `scrollToElement` を使用（固定ヘッダー高さ補正 + reduced-motion 対応）
 *
 * DOM 操作パターン（React が TOC リストをレンダリングしているため、属性操作は副作用として
 * `useEffect` 内で直接行う）。`useCallback` / `useMemo` 不要（React Compiler 自動メモ化）。
 */
export function ArticleTableOfContentsScrollSpy({
  ids,
}: ArticleTableOfContentsScrollSpyProps): null {
  const [activeId, setActiveId] = useState<string>("");

  // TOC リンクに aria-current を反映（activeId 変化時に DOM 属性を同期）
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

    const visible = new Map<string, number>(); // id -> top position (小さいほど上)

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
          // 画面上端に最も近い（= top が最小でも非負寄り）見出しを選ぶ
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
        // ヘッダー高さ分オフセット + viewport 下 60% 領域のみ監視
        rootMargin: "-120px 0px -40% 0px",
        threshold: 0,
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  // アンカークリックを乗っ取ってヘッダー高さを補正した smooth scroll に変換
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
      // URL の hash を更新（戻るボタンで該当位置に戻れるように）
      history.pushState(null, "", `#${id}`);
      setActiveId(id);
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return null;
}
