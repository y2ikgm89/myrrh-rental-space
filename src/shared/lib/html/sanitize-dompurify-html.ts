import DOMPurify, { type Config } from "isomorphic-dompurify";
import { isAllowedLexicalIframeHostname } from "@/shared/lib/html/lexical-html-sanitize-config";

export interface SanitizeDomPurifyHtmlOptions extends Config {
  /** Lexical 保存時と同じ iframe ホスト allowlist を適用する */
  readonly restrictIframeHostnames?: boolean;
}

function stripDisallowedIframes(html: string): string {
  if (!html.includes("iframe")) {
    return html;
  }

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );

  for (const iframe of doc.body.querySelectorAll("iframe")) {
    const src = iframe.getAttribute("src");
    if (!src || !isAllowedLexicalIframeHostname(src)) {
      iframe.remove();
    }
  }

  return doc.body.innerHTML;
}

/**
 * DOMPurify サニタイズ（公開 HTML 表示用）。
 * `restrictIframeHostnames` 時は `LEXICAL_ALLOWED_IFRAME_HOSTNAMES` 外の iframe を除去する。
 */
export function sanitizeDomPurifyHtml(
  html: string,
  options: SanitizeDomPurifyHtmlOptions,
): string {
  const { restrictIframeHostnames, ...domPurifyOptions } = options;
  const sanitized = DOMPurify.sanitize(html, domPurifyOptions);

  if (!restrictIframeHostnames) {
    return sanitized;
  }

  return stripDisallowedIframes(sanitized);
}
