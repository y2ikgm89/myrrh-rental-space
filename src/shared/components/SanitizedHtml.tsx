"use client";

/**
 * SanitizedHtml
 *
 * DOMPurify でサニタイズした HTML を表示する Client Component。
 * h2 / h3 には rehype-slug 互換の `id` 属性を自動付与し、目次（ArticleTableOfContents）
 * のアンカーリンクが機能するようにする（業界標準: GitHub / Notion / WordPress）。
 *
 * @security XSS 対策済み — DOMPurify による厳格なサニタイズ
 */

import { sanitize } from "isomorphic-dompurify";
import { injectHeadingAnchors } from "@/shared/lib/html/extract-headings";

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: [
    "allow",
    "allowfullscreen",
    "frameborder",
    "scrolling",
    "target",
    "rel",
    "loading",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

interface SanitizedHtmlProps {
  html: string;
  className?: string;
}

export function SanitizedHtml({ html, className }: SanitizedHtmlProps) {
  // DOMPurify でサニタイズ → heading に id 自動付与（決定論的、SSR/Client で同一結果）
  const cleanHtml = sanitize(html, DOMPURIFY_CONFIG);
  const withAnchors = injectHeadingAnchors(cleanHtml);

  return (
    <div
      className={className}
      // DOMPurify sanitized + heading id injected — XSS 対策済み
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: withAnchors }}
    />
  );
}
