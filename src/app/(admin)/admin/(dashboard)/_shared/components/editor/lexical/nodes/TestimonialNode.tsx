/**
 * Testimonial Node
 *
 * @description 顧客の口コミをカード形式で表示するコンポジットノード
 * TestimonialContainerNode + TestimonialItemNode の2ノード構成
 */

"use client";

import type { DOMConversionMap, EditorConfig } from "lexical";
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

  override canBeEmpty(): boolean {
    return false;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute(
      "data-layout",
      $getState(this, testimonialLayoutState),
    );
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

  override updateDOM(
    prevNode: TestimonialContainerNode,
    dom: HTMLElement,
  ): boolean {
    const layoutChange = $getStateChange(
      this,
      prevNode,
      testimonialLayoutState,
    );
    if (layoutChange) {
      const [newLayout] = layoutChange;
      dom.setAttribute("data-layout", newLayout);
    }
    const columnsChange = $getStateChange(
      this,
      prevNode,
      testimonialColumnsState,
    );
    if (columnsChange) {
      const [newColumns] = columnsChange;
      dom.setAttribute("data-columns", String(newColumns));
    }
    const colorChange = $getStateChange(
      this,
      prevNode,
      testimonialAccentColorState,
    );
    if (colorChange) {
      const [newColor] = colorChange;
      dom.setAttribute("data-color", newColor);
    }
    return false;
  }

  override exportDOM() {
    const div = document.createElement("div");
    div.setAttribute("data-testimonial", "");
    div.setAttribute(
      "data-layout",
      $getState(this, testimonialLayoutState),
    );
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

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
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
            const authorName = element.getAttribute("data-author-name") ?? "";
            const authorTitle =
              element.getAttribute("data-author-title") ?? "";
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
    blockquote.setAttribute(
      "data-date",
      $getState(this, testimonialDateState),
    );
    return blockquote;
  }

  override updateDOM(
    prevNode: TestimonialItemNode,
    dom: HTMLElement,
  ): boolean {
    const authorNameChange = $getStateChange(
      this,
      prevNode,
      testimonialAuthorNameState,
    );
    if (authorNameChange) {
      const [newAuthorName] = authorNameChange;
      dom.setAttribute("data-author-name", newAuthorName);
    }
    const authorTitleChange = $getStateChange(
      this,
      prevNode,
      testimonialAuthorTitleState,
    );
    if (authorTitleChange) {
      const [newAuthorTitle] = authorTitleChange;
      dom.setAttribute("data-author-title", newAuthorTitle);
    }
    const avatarUrlChange = $getStateChange(
      this,
      prevNode,
      testimonialAvatarUrlState,
    );
    if (avatarUrlChange) {
      const [newAvatarUrl] = avatarUrlChange;
      dom.setAttribute("data-avatar-url", newAvatarUrl);
    }
    const ratingChange = $getStateChange(
      this,
      prevNode,
      testimonialRatingState,
    );
    if (ratingChange) {
      const [newRating] = ratingChange;
      dom.setAttribute("data-rating", String(newRating));
    }
    const dateChange = $getStateChange(this, prevNode, testimonialDateState);
    if (dateChange) {
      const [newDate] = dateChange;
      dom.setAttribute("data-date", newDate);
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
    blockquote.setAttribute(
      "data-date",
      $getState(this, testimonialDateState),
    );
    return { element: blockquote };
  }

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
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
  node: unknown,
): node is TestimonialContainerNode {
  return node instanceof TestimonialContainerNode;
}

export function $isTestimonialItemNode(
  node: unknown,
): node is TestimonialItemNode {
  return node instanceof TestimonialItemNode;
}
