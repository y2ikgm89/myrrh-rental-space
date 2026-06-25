"use client";

/**
 * SanitizedHtml
 *
 * DOMPurify でサニタイズした HTML を表示する Client Component。
 * h2 / h3 には rehype-slug 互換の `id` 属性を自動付与し、目次（ArticleTableOfContents）
 * のアンカーリンクが機能するようにする（業界標準: GitHub / Notion / WordPress）。
 *
 * Lexical 本文中の Tabs ブロックは `exportDOM()` が static HTML を出力するだけで
 * クリックハンドラを持たないため、`useEffect` で `[data-tabs-container]` を hydrate
 * して tab 切替を有効化する（WordPress Gutenberg / Notion 等が採用する canonical な
 * server-render + client-hydrate pattern）。
 *
 * @security XSS 対策済み — DOMPurify による厳格なサニタイズ
 */

import { sanitize } from "isomorphic-dompurify";
import { useEffect, useRef } from "react";
import { injectHeadingAnchors } from "@/shared/lib/html/extract-headings";

export const SANITIZE_OPTIONS = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: [
    "allow",
    "allowfullscreen",
    "frameborder",
    "scrolling",
    "target",
    "rel",
    "loading",
    "data-gallery",
    "data-gallery-columns",
    "data-gallery-style",
    "data-gallery-item",
    "data-src",
    "data-alt",
    "data-caption",
    "data-gallery-img",
    "data-gallery-placeholder",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

interface SanitizedHtmlProps {
  html: string;
  className?: string;
}

/**
 * Lexical Tabs ブロックに click handler を attach する。
 *
 * DOM 構造（`TabsContainerNode.exportDOM()` 由来）:
 *   [data-tabs-container]
 *     [role="tablist"]
 *       [role="tab"][data-tab-index="N"][aria-selected="true|false"]
 *     [role="tabpanel"][data-tab-index="N"][aria-hidden?]
 *
 * tab クリック → コンテナの `data-tabs-active` 属性 + 全 tab の `aria-selected` +
 * 全 panel の `aria-hidden` を一括更新する。同じ `data-tab-index` で tab と panel
 * が対応する。ネストされた Tabs にも対応するため `:scope >` で直接子のみ拾う。
 */
function hydrateLexicalTabs(root: HTMLElement): () => void {
  const cleanups: (() => void)[] = [];

  for (const container of root.querySelectorAll<HTMLElement>(
    "[data-tabs-container]",
  )) {
    const tabs = Array.from(
      container.querySelectorAll<HTMLElement>(
        ':scope > [role="tablist"] [role="tab"]',
      ),
    );
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]'),
    );
    if (tabs.length === 0) continue;

    const activate = (activeIndex: number) => {
      container.setAttribute("data-tabs-active", String(activeIndex));
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab) tab.setAttribute("aria-selected", String(i === activeIndex));
      }
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        if (!panel) continue;
        if (i === activeIndex) panel.removeAttribute("aria-hidden");
        else panel.setAttribute("aria-hidden", "true");
      }
    };

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (!tab) continue;
      const index = i;
      const handler = (event: Event) => {
        event.preventDefault();
        activate(index);
      };
      tab.addEventListener("click", handler);
      cleanups.push(() => tab.removeEventListener("click", handler));
    }
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

export function SanitizedHtml({ html, className }: SanitizedHtmlProps) {
  // DOMPurify でサニタイズ → heading に id 自動付与（決定論的、SSR/Client で同一結果）
  const cleanHtml = sanitize(html, SANITIZE_OPTIONS);
  const withAnchors = injectHeadingAnchors(cleanHtml);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    return hydrateLexicalTabs(root);
  }, [withAnchors]);

  return (
    <div
      ref={ref}
      className={className}
      // DOMPurify sanitized + heading id injected — XSS 対策済み
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: withAnchors }}
    />
  );
}
