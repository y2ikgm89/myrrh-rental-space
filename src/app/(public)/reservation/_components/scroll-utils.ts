// ---------------------------------------------------------------------------
// Scroll utilities for the reservation flow
// ---------------------------------------------------------------------------

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

export function scrollToSectionAfterRender(id: string): void {
  setTimeout(() => scrollToElement(document.getElementById(id)), 100);
}
