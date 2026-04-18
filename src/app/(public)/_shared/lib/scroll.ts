/**
 * 公開ページ共通スクロールユーティリティ
 *
 * - `--header-height` CSS 変数を読み取って固定ヘッダー分のオフセットを差し引く
 * - `prefers-reduced-motion: reduce` の場合は `behavior: "instant"` に自動切替
 * - SSR セーフ（`typeof window === "undefined"` ガード）
 *
 * 予約フローの step scroll / 目次アンカージャンプ / ページ内リンクで共用する。
 */

function getScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}

function getHeaderHeight(): number {
  if (typeof window === "undefined") return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    "--header-height",
  );
  return parseInt(value, 10) || 0;
}

const SCROLL_MARGIN = 16;

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: getScrollBehavior() });
}

export function scrollToElement(el: HTMLElement | null): void {
  if (!el) return;
  const top =
    el.getBoundingClientRect().top +
    window.scrollY -
    getHeaderHeight() -
    SCROLL_MARGIN;
  window.scrollTo({ top: Math.max(0, top), behavior: getScrollBehavior() });
}

export function scrollToElementById(id: string): void {
  scrollToElement(document.getElementById(id));
}

export function scrollToSectionAfterRender(id: string): void {
  setTimeout(() => scrollToElement(document.getElementById(id)), 100);
}
