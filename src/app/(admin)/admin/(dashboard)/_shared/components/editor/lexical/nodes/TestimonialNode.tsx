/**
 * Testimonial Node
 *
 * @description 顧客の口コミをカード形式で表示するコンポジットノード
 * TestimonialContainerNode + TestimonialItemNode の2ノード構成
 */

import type { DOMConversionMap, EditorConfig, LexicalNode } from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";
import { parseString } from "../config/type-guards";
import { createEnumGuard } from "../config/type-guards";
import { type AccentColor, isAccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export type TestimonialLayout = "list" | "grid";
export type TestimonialColumns = 1 | 2 | 3;
export type TestimonialRating = 1 | 2 | 3 | 4 | 5;

// =============================================================================
// Helpers
// =============================================================================

export const TESTIMONIAL_LAYOUTS: readonly TestimonialLayout[] = [
  "list",
  "grid",
] as const;
export const isTestimonialLayout =
  createEnumGuard<TestimonialLayout>(TESTIMONIAL_LAYOUTS);

function parseColumns(v: unknown): TestimonialColumns {
  if (v === 1 || v === 2 || v === 3) return v;
  return 2;
}

function parseRating(v: unknown): TestimonialRating {
  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) return v;
  return 5;
}

// =============================================================================
// TestimonialContainerNode States
// =============================================================================

export const testimonialLayoutState = createState("layout", {
  parse: (v: unknown): TestimonialLayout =>
    typeof v === "string" && isTestimonialLayout(v) ? v : "grid",
});

export const testimonialColumnsState = createState("columns", {
  parse: parseColumns,
});

export const testimonialAccentColorState = createState("accentColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

// =============================================================================
// TestimonialContainerNode
// =============================================================================

export class TestimonialContainerNode extends ElementNode {
  override $config() {
    return this.config("testimonial-container", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: testimonialLayoutState },
        { flat: true, stateConfig: testimonialColumnsState },
        { flat: true, stateConfig: testimonialAccentColorState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-testimonial")
        )
          return null;
        return {
          conversion: (element) => {
            const layout = element.getAttribute("data-layout");
            const columnsRaw = element.getAttribute("data-columns");
            const color = element.getAttribute("data-color");
            const node = $createTestimonialContainerNode({
              layout:
                typeof layout === "string" && isTestimonialLayout(layout)
                  ? layout
                  : "grid",
              columns: parseColumns(
                columnsRaw !== null ? parseInt(columnsRaw, 10) : undefined,
              ),
              accentColor:
                typeof color === "string" && isAccentColor(color)
                  ? color
                  : "default",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override canBeEmpty(): false {
    return false;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute("data-layout", $getState(this, testimonialLayoutState));
    div.setAttribute(
      "data-columns",
      String($getState(this, testimonialColumnsState)),
    );
    div.setAttribute(
      "data-color",
      $getState(this, testimonialAccentColorState),
    );
    return div;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const layoutChange = $getStateChange(
      this,
      prevNode,
      testimonialLayoutState,
    );
    if (layoutChange !== null) {
      const [newLayout] = layoutChange;
      dom.setAttribute("data-layout", newLayout);
    }
    const columnsChange = $getStateChange(
      this,
      prevNode,
      testimonialColumnsState,
    );
    if (columnsChange !== null) {
      const [newColumns] = columnsChange;
      dom.setAttribute("data-columns", String(newColumns));
    }
    const colorChange = $getStateChange(
      this,
      prevNode,
      testimonialAccentColorState,
    );
    if (colorChange !== null) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute("data-layout", $getState(this, testimonialLayoutState));
    div.setAttribute(
      "data-columns",
      String($getState(this, testimonialColumnsState)),
    );
    div.setAttribute(
      "data-color",
      $getState(this, testimonialAccentColorState),
    );
    return { element: div };
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// TestimonialItemNode States
// =============================================================================

export const testimonialAuthorNameState = createState("authorName", {
  parse: parseString,
});

export const testimonialAuthorTitleState = createState("authorTitle", {
  parse: parseString,
});

export const testimonialAvatarUrlState = createState("avatarUrl", {
  parse: parseString,
});

export const testimonialRatingState = createState("rating", {
  parse: parseRating,
});

export const testimonialDateState = createState("date", {
  parse: parseString,
});

// =============================================================================
// TestimonialItem DOM helper（createDOM / updateDOM 共通）
//
// TestimonialItemNode の rating / authorName / authorTitle / avatarUrl / date を
// blockquote 内に実要素として注入する。
// 引用本文（Lexical 子ノード）はその後に Lexical が描画するため、
// CSS の flex order で rating(上) → 引用本文(中) → 著者ブロック(下) の順を制御する。
// =============================================================================

function buildRatingStars(rating: number): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-testimonial-rating", "");
  wrapper.setAttribute("aria-label", `評価 ${String(rating)}/5`);
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.setAttribute("data-star", i <= rating ? "filled" : "empty");
    star.setAttribute("aria-hidden", "true");
    star.textContent = "★";
    wrapper.appendChild(star);
  }
  return wrapper;
}

function applyTestimonialItemMeta(
  host: HTMLElement,
  authorName: string,
  authorTitle: string,
  avatarUrl: string,
  rating: number,
  date: string,
): void {
  host
    .querySelectorAll(
      ":scope > [data-testimonial-rating], :scope > [data-testimonial-author]",
    )
    .forEach((el) => el.remove());

  // 評価（order: -1 で引用本文より前に表示）
  const ratingEl = buildRatingStars(rating);
  host.insertAdjacentElement("afterbegin", ratingEl);

  // 著者ブロック（order: 1 で引用本文より後に表示）
  const authorBlock = document.createElement("div");
  authorBlock.setAttribute("data-testimonial-author", "");

  if (avatarUrl) {
    const img = document.createElement("img");
    img.setAttribute("data-testimonial-avatar", "");
    img.setAttribute("src", avatarUrl);
    img.setAttribute("alt", authorName ? `${authorName}のアバター` : "");
    img.setAttribute("aria-hidden", "true");
    authorBlock.appendChild(img);
  }

  const textBlock = document.createElement("div");
  textBlock.setAttribute("data-testimonial-author-text", "");

  if (authorName) {
    const nameEl = document.createElement("span");
    nameEl.setAttribute("data-testimonial-author-name", "");
    nameEl.textContent = authorName;
    textBlock.appendChild(nameEl);
  }

  if (authorTitle) {
    const titleEl = document.createElement("span");
    titleEl.setAttribute("data-testimonial-author-title", "");
    titleEl.textContent = authorTitle;
    textBlock.appendChild(titleEl);
  }

  if (date) {
    const dateEl = document.createElement("span");
    dateEl.setAttribute("data-testimonial-date", "");
    dateEl.textContent = date;
    textBlock.appendChild(dateEl);
  }

  authorBlock.appendChild(textBlock);
  host.appendChild(authorBlock);
}

// =============================================================================
// TestimonialItemNode
// =============================================================================

export class TestimonialItemNode extends ElementNode {
  override $config() {
    return this.config("testimonial-item", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: testimonialAuthorNameState },
        { flat: true, stateConfig: testimonialAuthorTitleState },
        { flat: true, stateConfig: testimonialAvatarUrlState },
        { flat: true, stateConfig: testimonialRatingState },
        { flat: true, stateConfig: testimonialDateState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      blockquote: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-testimonial-item")
        )
          return null;
        return {
          conversion: (element) => {
            // 注入された表示用メタ（星評価・著者ブロック）は子として取り込まない
            element
              .querySelectorAll(
                ":scope > [data-testimonial-rating], :scope > [data-testimonial-author]",
              )
              .forEach((el) => el.remove());
            const authorName = element.getAttribute("data-author-name") ?? "";
            const authorTitle = element.getAttribute("data-author-title") ?? "";
            const avatarUrl = element.getAttribute("data-avatar-url") ?? "";
            const ratingRaw = element.getAttribute("data-rating");
            const date = element.getAttribute("data-date") ?? "";
            const node = $createTestimonialItemNode({
              authorName,
              authorTitle,
              avatarUrl,
              rating: parseRating(
                ratingRaw !== null ? parseInt(ratingRaw, 10) : undefined,
              ),
              date,
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override isShadowRoot(): boolean {
    return true;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const blockquote = document.createElement("blockquote");
    blockquote.setAttribute("data-testimonial-item", "");
    blockquote.setAttribute(
      "data-author-name",
      $getState(this, testimonialAuthorNameState),
    );
    blockquote.setAttribute(
      "data-author-title",
      $getState(this, testimonialAuthorTitleState),
    );
    blockquote.setAttribute(
      "data-avatar-url",
      $getState(this, testimonialAvatarUrlState),
    );
    blockquote.setAttribute(
      "data-rating",
      String($getState(this, testimonialRatingState)),
    );
    blockquote.setAttribute("data-date", $getState(this, testimonialDateState));
    applyTestimonialItemMeta(
      blockquote,
      $getState(this, testimonialAuthorNameState),
      $getState(this, testimonialAuthorTitleState),
      $getState(this, testimonialAvatarUrlState),
      $getState(this, testimonialRatingState),
      $getState(this, testimonialDateState),
    );
    return blockquote;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const authorNameChange = $getStateChange(
      this,
      prevNode,
      testimonialAuthorNameState,
    );
    const authorTitleChange = $getStateChange(
      this,
      prevNode,
      testimonialAuthorTitleState,
    );
    const avatarUrlChange = $getStateChange(
      this,
      prevNode,
      testimonialAvatarUrlState,
    );
    const ratingChange = $getStateChange(
      this,
      prevNode,
      testimonialRatingState,
    );
    const dateChange = $getStateChange(this, prevNode, testimonialDateState);

    if (authorNameChange !== null) {
      const [newAuthorName] = authorNameChange;
      dom.setAttribute("data-author-name", newAuthorName);
    }
    if (authorTitleChange !== null) {
      const [newAuthorTitle] = authorTitleChange;
      dom.setAttribute("data-author-title", newAuthorTitle);
    }
    if (avatarUrlChange !== null) {
      const [newAvatarUrl] = avatarUrlChange;
      dom.setAttribute("data-avatar-url", newAvatarUrl);
    }
    if (ratingChange !== null) {
      const [newRating] = ratingChange;
      dom.setAttribute("data-rating", String(newRating));
    }
    if (dateChange !== null) {
      const [newDate] = dateChange;
      dom.setAttribute("data-date", newDate);
    }
    if (
      authorNameChange !== null ||
      authorTitleChange !== null ||
      avatarUrlChange !== null ||
      ratingChange !== null ||
      dateChange !== null
    ) {
      applyTestimonialItemMeta(
        dom,
        $getState(this, testimonialAuthorNameState),
        $getState(this, testimonialAuthorTitleState),
        $getState(this, testimonialAvatarUrlState),
        $getState(this, testimonialRatingState),
        $getState(this, testimonialDateState),
      );
    }
    return false;
  }

  override exportDOM() {
    const blockquote = document.createElement("blockquote");
    blockquote.setAttribute("data-testimonial-item", "");
    blockquote.setAttribute(
      "data-author-name",
      $getState(this, testimonialAuthorNameState),
    );
    blockquote.setAttribute(
      "data-author-title",
      $getState(this, testimonialAuthorTitleState),
    );
    blockquote.setAttribute(
      "data-avatar-url",
      $getState(this, testimonialAvatarUrlState),
    );
    blockquote.setAttribute(
      "data-rating",
      String($getState(this, testimonialRatingState)),
    );
    blockquote.setAttribute("data-date", $getState(this, testimonialDateState));
    applyTestimonialItemMeta(
      blockquote,
      $getState(this, testimonialAuthorNameState),
      $getState(this, testimonialAuthorTitleState),
      $getState(this, testimonialAvatarUrlState),
      $getState(this, testimonialRatingState),
      $getState(this, testimonialDateState),
    );
    return { element: blockquote };
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createTestimonialContainerNode(
  params: {
    layout?: TestimonialLayout;
    columns?: TestimonialColumns;
    accentColor?: AccentColor;
  } = {},
): TestimonialContainerNode {
  const node = $create(TestimonialContainerNode);
  $setState(node, testimonialLayoutState, params.layout ?? "grid");
  $setState(node, testimonialColumnsState, params.columns ?? 2);
  $setState(node, testimonialAccentColorState, params.accentColor ?? "default");
  return node;
}

export function $createTestimonialItemNode(
  params: {
    authorName?: string;
    authorTitle?: string;
    avatarUrl?: string;
    rating?: TestimonialRating;
    date?: string;
  } = {},
): TestimonialItemNode {
  const node = $create(TestimonialItemNode);
  $setState(node, testimonialAuthorNameState, params.authorName ?? "");
  $setState(node, testimonialAuthorTitleState, params.authorTitle ?? "");
  $setState(node, testimonialAvatarUrlState, params.avatarUrl ?? "");
  $setState(node, testimonialRatingState, params.rating ?? 5);
  $setState(node, testimonialDateState, params.date ?? "");
  return node;
}

export function $isTestimonialContainerNode(
  node: LexicalNode | null | undefined,
): node is TestimonialContainerNode {
  return node instanceof TestimonialContainerNode;
}

export function $isTestimonialItemNode(
  node: LexicalNode | null | undefined,
): node is TestimonialItemNode {
  return node instanceof TestimonialItemNode;
}
