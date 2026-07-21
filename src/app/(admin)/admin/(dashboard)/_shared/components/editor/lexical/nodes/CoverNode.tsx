/**
 * Cover Node
 *
 * @description 背景画像にテキストを重ねて表示するカバーブロック
 * 子要素: HeadingNode + ParagraphNode（直接編集可能）
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
} from "lexical";
import { createEnumGuard } from "../config/type-guards";
import { isAccentColor, type AccentColor } from "../config/accent-colors";

// =============================================================================
// Types
// =============================================================================

export const COVER_MIN_HEIGHTS = ["sm", "md", "lg", "xl", "full"] as const;
export type CoverMinHeight = (typeof COVER_MIN_HEIGHTS)[number];

export const COVER_CONTENT_ALIGNS = ["left", "center", "right"] as const;
export type CoverContentAlign = (typeof COVER_CONTENT_ALIGNS)[number];

export const COVER_CONTENT_POSITIONS = ["top", "center", "bottom"] as const;
export type CoverContentPosition = (typeof COVER_CONTENT_POSITIONS)[number];

export const COVER_OVERLAY_OPACITIES = [
  0, 10, 20, 30, 40, 50, 60, 70, 80,
] as const;
export type CoverOverlayOpacity = (typeof COVER_OVERLAY_OPACITIES)[number];

// =============================================================================
// Type Guards
// =============================================================================

export const isCoverMinHeight =
  createEnumGuard<CoverMinHeight>(COVER_MIN_HEIGHTS);
export const isCoverContentAlign =
  createEnumGuard<CoverContentAlign>(COVER_CONTENT_ALIGNS);
export const isCoverContentPosition = createEnumGuard<CoverContentPosition>(
  COVER_CONTENT_POSITIONS,
);

export function isCoverOverlayOpacity(v: unknown): v is CoverOverlayOpacity {
  return (
    v === 0 ||
    v === 10 ||
    v === 20 ||
    v === 30 ||
    v === 40 ||
    v === 50 ||
    v === 60 ||
    v === 70 ||
    v === 80
  );
}

// =============================================================================
// URL サニタイズ
// =============================================================================

// `background-image: url(...)` は sanitize-html の allowedSchemes（href/src 用）の
// 対象外（CSS 値はスキームチェックされない）。CustomTableCellNode の
// backgroundColor 等と異なり `url()` 内は任意スキームを受け付ける CSS 文法のため、
// `javascript:` のようなスキームが exportDOM の `style.backgroundImage = url(...)`
// を経由してそのまま最終 HTML に残ってしまう（実測で確認済み）。
// 現行ブラウザは image 取得コンテキストで javascript: を実行しないが、本リポジトリの
// 既存方針（LinkNode 由来 href は javascript: を一律排除）に揃え、http(s) と
// サイト相対パスのみを許可する allowlist で防御する。
const SAFE_BACKGROUND_IMAGE_URL_PATTERN = /^(https?:\/\/|\/)/i;

// Codex レビュー指摘（PR#1367 followup, スレッド PRRT_kwDOQ0jEts6SnTcA）:
// 上記の prefix チェックだけでは
// `https://safe.example/x),url(javascript:alert\`1\`)` のような値が
// 「https:// で始まる」という理由で通過してしまう。この値は exportDOM で
// `url(${value})` として素の文字列展開されるため、`)`（url() を閉じる）と
// 続く `,url(`（CSS の background-image はカンマ区切りで複数指定できる）を
// 埋め込むことで、実質的に2つ目の `url(javascript:...)` を注入できる。
// prefix だけでなく「文字列全体が単一の妥当な URL である」ことを検証する:
//   1. url() トークンを閉じたり複数値化しうる文字（空白・括弧・引用符・
//      バックスラッシュ・バッククォート・カンマ・セミコロン）を含む値は
//      それだけで拒否する（正規の URL がこれらを生で含む必要は無い）
//   2. その上で `URL` コンストラクタで単一の URL としてパース可能か、
//      絶対 URL の場合はスキームが http(s) であることを確認する
const UNSAFE_CSS_URL_BREAKOUT_CHARACTERS_PATTERN = /["'`(),;\\\s]/;

function parseBackgroundImageUrl(v: unknown): string {
  if (typeof v !== "string" || v === "") return "";
  if (!SAFE_BACKGROUND_IMAGE_URL_PATTERN.test(v)) return "";
  if (UNSAFE_CSS_URL_BREAKOUT_CHARACTERS_PATTERN.test(v)) return "";

  if (v.startsWith("/")) {
    try {
      // サイト相対パスの構文妥当性のみ確認する（origin は固定 placeholder）
      new URL(v, "https://cover-image.invalid");
      return v;
    } catch {
      return "";
    }
  }

  try {
    const parsed = new URL(v);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}

// =============================================================================
// State
// =============================================================================

export const backgroundImageUrlState = createState("backgroundImageUrl", {
  parse: parseBackgroundImageUrl,
});

export const overlayColorState = createState("overlayColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

export const overlayOpacityState = createState("overlayOpacity", {
  parse: (v: unknown): CoverOverlayOpacity =>
    isCoverOverlayOpacity(v) ? v : 40,
});

export const minHeightState = createState("minHeight", {
  parse: (v: unknown): CoverMinHeight =>
    typeof v === "string" && isCoverMinHeight(v) ? v : "md",
});

export const contentAlignState = createState("contentAlign", {
  parse: (v: unknown): CoverContentAlign =>
    typeof v === "string" && isCoverContentAlign(v) ? v : "center",
});

export const contentPositionState = createState("contentPosition", {
  parse: (v: unknown): CoverContentPosition =>
    typeof v === "string" && isCoverContentPosition(v) ? v : "center",
});

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCoverElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const bgStyle = element.style.backgroundImage;
  const rawBackgroundImageUrl = bgStyle
    ? bgStyle.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "")
    : "";
  const backgroundImageUrl = parseBackgroundImageUrl(rawBackgroundImageUrl);

  const overlayColorAttr = element.getAttribute("data-color") ?? "default";
  const overlayColor: AccentColor =
    typeof overlayColorAttr === "string" && isAccentColor(overlayColorAttr)
      ? overlayColorAttr
      : "default";

  const overlayOpacityAttr = element.getAttribute("data-overlay-opacity");
  const parsedOpacity =
    overlayOpacityAttr !== null ? parseInt(overlayOpacityAttr, 10) : 40;
  const overlayOpacity: CoverOverlayOpacity = isCoverOverlayOpacity(
    parsedOpacity,
  )
    ? parsedOpacity
    : 40;

  const minHeightAttr = element.getAttribute("data-min-height") ?? "md";
  const minHeight: CoverMinHeight =
    typeof minHeightAttr === "string" && isCoverMinHeight(minHeightAttr)
      ? minHeightAttr
      : "md";

  const contentAlignAttr =
    element.getAttribute("data-content-align") ?? "center";
  const contentAlign: CoverContentAlign =
    typeof contentAlignAttr === "string" &&
    isCoverContentAlign(contentAlignAttr)
      ? contentAlignAttr
      : "center";

  const contentPositionAttr =
    element.getAttribute("data-content-position") ?? "center";
  const contentPosition: CoverContentPosition =
    typeof contentPositionAttr === "string" &&
    isCoverContentPosition(contentPositionAttr)
      ? contentPositionAttr
      : "center";

  const node = $createCoverNode({
    backgroundImageUrl,
    overlayColor,
    overlayOpacity,
    minHeight,
    contentAlign,
    contentPosition,
  });
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class CoverNode extends ElementNode {
  override $config() {
    return this.config("cover", {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: backgroundImageUrlState },
        { flat: true, stateConfig: overlayColorState },
        { flat: true, stateConfig: overlayOpacityState },
        { flat: true, stateConfig: minHeightState },
        { flat: true, stateConfig: contentAlignState },
        { flat: true, stateConfig: contentPositionState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-cover")
        )
          return null;
        return {
          conversion: $convertCoverElement,
          priority: 2,
        };
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-cover", "");
    element.setAttribute("data-color", $getState(this, overlayColorState));
    element.setAttribute(
      "data-overlay-opacity",
      String($getState(this, overlayOpacityState)),
    );
    element.setAttribute("data-min-height", $getState(this, minHeightState));
    element.setAttribute(
      "data-content-align",
      $getState(this, contentAlignState),
    );
    element.setAttribute(
      "data-content-position",
      $getState(this, contentPositionState),
    );
    const bgUrl = $getState(this, backgroundImageUrlState);
    if (bgUrl) {
      element.style.backgroundImage = `url(${bgUrl})`;
    }
    return { element };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-cover", "");
    div.setAttribute("data-color", $getState(this, overlayColorState));
    div.setAttribute(
      "data-overlay-opacity",
      String($getState(this, overlayOpacityState)),
    );
    div.setAttribute("data-min-height", $getState(this, minHeightState));
    div.setAttribute("data-content-align", $getState(this, contentAlignState));
    div.setAttribute(
      "data-content-position",
      $getState(this, contentPositionState),
    );
    const bgUrl = $getState(this, backgroundImageUrlState);
    if (bgUrl) {
      div.style.backgroundImage = `url(${bgUrl})`;
    }
    return div;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    const bgChange = $getStateChange(this, prevNode, backgroundImageUrlState);
    if (bgChange !== null) {
      const [newBg] = bgChange;
      if (newBg) {
        dom.style.backgroundImage = `url(${newBg})`;
      } else {
        dom.style.backgroundImage = "";
      }
    }

    const overlayColorChange = $getStateChange(
      this,
      prevNode,
      overlayColorState,
    );
    if (overlayColorChange !== null) {
      const [newColor] = overlayColorChange;
      dom.setAttribute("data-color", newColor);
    }

    const overlayOpacityChange = $getStateChange(
      this,
      prevNode,
      overlayOpacityState,
    );
    if (overlayOpacityChange !== null) {
      const [newOpacity] = overlayOpacityChange;
      dom.setAttribute("data-overlay-opacity", String(newOpacity));
    }

    const minHeightChange = $getStateChange(this, prevNode, minHeightState);
    if (minHeightChange !== null) {
      const [newMinHeight] = minHeightChange;
      dom.setAttribute("data-min-height", newMinHeight);
    }

    const contentAlignChange = $getStateChange(
      this,
      prevNode,
      contentAlignState,
    );
    if (contentAlignChange !== null) {
      const [newAlign] = contentAlignChange;
      dom.setAttribute("data-content-align", newAlign);
    }

    const contentPositionChange = $getStateChange(
      this,
      prevNode,
      contentPositionState,
    );
    if (contentPositionChange !== null) {
      const [newPosition] = contentPositionChange;
      dom.setAttribute("data-content-position", newPosition);
    }

    return false;
  }

  override isShadowRoot(): boolean {
    return true;
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

export type CreateCoverNodeOptions = {
  backgroundImageUrl?: string;
  overlayColor?: AccentColor;
  overlayOpacity?: CoverOverlayOpacity;
  minHeight?: CoverMinHeight;
  contentAlign?: CoverContentAlign;
  contentPosition?: CoverContentPosition;
};

/**
 * CoverNode を作成する
 */
export function $createCoverNode(
  options: CreateCoverNodeOptions = {},
): CoverNode {
  const {
    backgroundImageUrl = "",
    overlayColor = "default",
    overlayOpacity = 40,
    minHeight = "md",
    contentAlign = "center",
    contentPosition = "center",
  } = options;
  const node = $create(CoverNode);
  $setState(node, backgroundImageUrlState, backgroundImageUrl);
  $setState(node, overlayColorState, overlayColor);
  $setState(node, overlayOpacityState, overlayOpacity);
  $setState(node, minHeightState, minHeight);
  $setState(node, contentAlignState, contentAlign);
  $setState(node, contentPositionState, contentPosition);
  return node;
}

/**
 * ノードが CoverNode かどうかを判定する
 */
export function $isCoverNode(
  node: LexicalNode | null | undefined,
): node is CoverNode {
  return node instanceof CoverNode;
}
