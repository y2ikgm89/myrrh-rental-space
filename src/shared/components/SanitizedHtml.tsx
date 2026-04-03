"use client";

/**
 * SanitizedHtml
 *
 * DOMPurifyでサニタイズしたHTMLを表示するClient Component
 * Next.js 16のprerendering制約（new Date()問題）を回避
 *
 * @security XSS対策済み - DOMPurifyによる厳格なサニタイズを実施
 */

import { sanitize } from "isomorphic-dompurify";

// DOMPurify設定
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
  // DOMPurifyでXSS対策済み - 全てのHTML入力をサニタイズ
  const cleanHtml = sanitize(html, DOMPURIFY_CONFIG);

  return (
    <div
      className={className}
      // DOMPurify sanitized - XSS対策済み
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
