import { withDOM } from "@lexical/headless/dom";
import { getCuratedIconSvgMarkup } from "@/shared/lib/html/curated-icon-svg-markup";

type IconEnrichmentTarget = {
  readonly selector: string;
  readonly className: string | undefined;
  readonly position: "prepend" | "append";
};

const ICON_ENRICHMENT_TARGETS: readonly IconEnrichmentTarget[] = [
  {
    selector:
      '[data-lexical-inline-icon][data-icon-name]:not([data-icon-name=""])',
    className: "inline-icon-svg",
    position: "append",
  },
  {
    selector:
      '[data-feature-icon-item][data-icon-name]:not([data-icon-name=""])',
    className: "feature-icon-svg",
    position: "prepend",
  },
  {
    selector: '[data-button-icon][data-icon-name]:not([data-icon-name=""])',
    className: undefined,
    position: "append",
  },
];

function resolveIconMarkup(
  iconName: string,
  className: string | undefined,
): string {
  const base = getCuratedIconSvgMarkup(iconName);
  if (!base) return "";

  if (className === undefined) {
    return base.replace(/\sclass="inline-icon-svg"/u, "");
  }

  return base.replace("inline-icon-svg", className);
}

function hostAlreadyHasIcon(host: HTMLElement): boolean {
  return host.querySelector(":scope svg[data-icon-svg]") !== null;
}

function injectCuratedIconSvg(
  host: HTMLElement,
  iconName: string,
  className: string | undefined,
  position: "prepend" | "append",
): void {
  if (hostAlreadyHasIcon(host)) return;

  const markup = resolveIconMarkup(iconName, className);
  if (markup === "") return;

  host.insertAdjacentHTML(
    position === "prepend" ? "afterbegin" : "beforeend",
    markup,
  );

  const svg =
    position === "prepend"
      ? host.querySelector(":scope > svg")
      : host.querySelector(":scope svg");
  if (svg) svg.setAttribute("data-icon-svg", "");
}

function enrichLexicalContentHtmlWithCuratedIconsInDom(html: string): string {
  const trimmed = html.trim();
  if (trimmed === "") return html;

  const doc = new DOMParser().parseFromString(trimmed, "text/html");

  for (const { selector, className, position } of ICON_ENRICHMENT_TARGETS) {
    for (const host of doc.querySelectorAll<HTMLElement>(selector)) {
      const iconName = host.getAttribute("data-icon-name");
      if (!iconName) continue;
      injectCuratedIconSvg(host, iconName, className, position);
    }
  }

  return doc.body.innerHTML;
}

/**
 * Lexical export HTML の `data-icon-name` プレースホルダへ curated Tabler SVG を注入。
 */
export function enrichLexicalContentHtmlWithCuratedIcons(html: string): string {
  if (html.trim() === "") return html;

  if (typeof DOMParser !== "undefined") {
    return enrichLexicalContentHtmlWithCuratedIconsInDom(html);
  }

  return withDOM(() => enrichLexicalContentHtmlWithCuratedIconsInDom(html));
}
