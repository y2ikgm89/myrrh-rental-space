import type { ReactElement } from "react";
import { headers } from "next/headers";
import { sanitizeCss } from "./sanitize-css";

interface NonceStyleBlockProps {
  readonly id: string;
  readonly css: string;
}

/**
 * Server-only nonce-protected <style> for SSR-determined CSS custom properties.
 * Pairs with `[data-style-id="…"]` on target elements.
 */
export async function NonceStyleBlock({
  id,
  css,
}: NonceStyleBlockProps): Promise<ReactElement | null> {
  const trimmed = css.trim();
  if (!trimmed) return null;

  const nonce = (await headers()).get("x-nonce");
  if (!nonce) return null;

  return (
    <style
      nonce={nonce}
      data-csp-id={id}
      // CSP nonce-protected <style> requires dangerouslySetInnerHTML for sanitized CSS injection.
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- intentional nonce style block
      dangerouslySetInnerHTML={{ __html: sanitizeCss(trimmed) }}
    />
  );
}
