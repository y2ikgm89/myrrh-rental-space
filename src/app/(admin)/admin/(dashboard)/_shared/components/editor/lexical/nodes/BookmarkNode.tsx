/**
 * Bookmark Node
 *
 * @description ブックマーク/リンクカードを表示するDecoratorNode
 * OGP情報（タイトル、説明、画像、favicon）を表示
 */

"use client";

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { ExternalLink } from "lucide-react";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const bookmarkUrlState = createState("url", {
  parse: parseString,
});

export const bookmarkTitleState = createState("title", {
  parse: parseString,
});

export const bookmarkDescriptionState = createState("description", {
  parse: parseString,
});

export const bookmarkImageUrlState = createState("imageUrl", {
  parse: parseString,
});

export const bookmarkFaviconUrlState = createState("faviconUrl", {
  parse: parseString,
});

export const bookmarkSiteNameState = createState("siteName", {
  parse: parseString,
});

// =============================================================================
// Component
// =============================================================================

function BookmarkComponent({
  url,
  title,
  description,
  imageUrl,
  faviconUrl,
  siteName,
  nodeKey,
}: {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  faviconUrl: string;
  siteName: string;
  nodeKey: NodeKey;
}) {
  return (
    <div data-lexical-node-key={nodeKey} data-bookmark className="my-6">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors"
        draggable={false}
        onClick={(e) => e.preventDefault()} // エディタ内ではナビゲーション無効
      >
        <div className="flex">
          {/* テキスト部分 */}
          <div className="flex-1 p-4 min-w-0">
            {/* サイト情報 */}
            <div className="flex items-center gap-2 mb-2">
              {faviconUrl ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-4 h-4 rounded-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground truncate">
                {siteName ||
                  (url
                    ? (() => {
                        try {
                          return new URL(url).hostname;
                        } catch {
                          return url;
                        }
                      })()
                    : "")}
              </span>
            </div>
            {/* タイトル */}
            <h4 className="font-medium text-sm line-clamp-2 mb-1">
              {title || url}
            </h4>
            {/* 説明 */}
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {description}
              </p>
            )}
          </div>
          {/* 画像部分 */}
          {imageUrl && (
            <div className="w-32 h-24 flex-shrink-0">
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.parentElement?.remove();
                }}
              />
            </div>
          )}
        </div>
      </a>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertBookmarkElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const link = element.querySelector("a");
  if (!link) return null;

  const url = link.getAttribute("href") ?? "";
  const title = element.getAttribute("data-bookmark-title") ?? "";
  const description = element.getAttribute("data-bookmark-description") ?? "";
  const imageUrl = element.getAttribute("data-bookmark-image") ?? "";
  const faviconUrl = element.getAttribute("data-bookmark-favicon") ?? "";
  const siteName = element.getAttribute("data-bookmark-site") ?? "";

  const node = $createBookmarkNode({
    url,
    title,
    description,
    imageUrl,
    faviconUrl,
    siteName,
  });
  return { node };
}

// =============================================================================
// Node Class
// =============================================================================

export class BookmarkNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("bookmark", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: bookmarkUrlState },
        { flat: true, stateConfig: bookmarkTitleState },
        { flat: true, stateConfig: bookmarkDescriptionState },
        { flat: true, stateConfig: bookmarkImageUrlState },
        { flat: true, stateConfig: bookmarkFaviconUrlState },
        { flat: true, stateConfig: bookmarkSiteNameState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-bookmark")) {
          return {
            conversion: $convertBookmarkElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const url = $getState(this, bookmarkUrlState);
    const title = $getState(this, bookmarkTitleState);
    const description = $getState(this, bookmarkDescriptionState);
    const imageUrl = $getState(this, bookmarkImageUrlState);
    const faviconUrl = $getState(this, bookmarkFaviconUrlState);
    const siteName = $getState(this, bookmarkSiteNameState);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-bookmark", "true");
    wrapper.setAttribute("data-bookmark-title", title);
    wrapper.setAttribute("data-bookmark-description", description);
    wrapper.setAttribute("data-bookmark-image", imageUrl);
    wrapper.setAttribute("data-bookmark-favicon", faviconUrl);
    wrapper.setAttribute("data-bookmark-site", siteName);

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const content = document.createElement("div");
    content.setAttribute("data-bookmark-content", "");

    // テキスト部分
    const textDiv = document.createElement("div");
    textDiv.setAttribute("data-bookmark-text", "");

    // サイト情報
    const siteInfo = document.createElement("div");
    siteInfo.setAttribute("data-bookmark-site-info", "");

    if (faviconUrl) {
      const favicon = document.createElement("img");
      favicon.src = faviconUrl;
      favicon.alt = "";
      favicon.setAttribute("data-bookmark-favicon-img", "");
      siteInfo.appendChild(favicon);
    }

    const siteNameEl = document.createElement("span");
    siteNameEl.textContent =
      siteName ||
      (() => {
        try {
          return url ? new URL(url).hostname : "";
        } catch {
          return url;
        }
      })();
    siteInfo.appendChild(siteNameEl);
    textDiv.appendChild(siteInfo);

    // タイトル
    const titleEl = document.createElement("h4");
    titleEl.textContent = title || url;
    textDiv.appendChild(titleEl);

    // 説明
    if (description) {
      const descEl = document.createElement("p");
      descEl.textContent = description;
      textDiv.appendChild(descEl);
    }

    content.appendChild(textDiv);

    // 画像部分
    if (imageUrl) {
      const imageDiv = document.createElement("div");
      imageDiv.setAttribute("data-bookmark-image-wrap", "");
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      imageDiv.appendChild(image);
      content.appendChild(imageDiv);
    }

    link.appendChild(content);
    wrapper.appendChild(link);

    return { element: wrapper };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-bookmark", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <BookmarkComponent
        url={$getState(this, bookmarkUrlState)}
        title={$getState(this, bookmarkTitleState)}
        description={$getState(this, bookmarkDescriptionState)}
        imageUrl={$getState(this, bookmarkImageUrlState)}
        faviconUrl={$getState(this, bookmarkFaviconUrlState)}
        siteName={$getState(this, bookmarkSiteNameState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * ブックマークノードを作成する
 *
 * @param params - ブックマークのパラメータ
 * @returns BookmarkNode インスタンス
 */
export function $createBookmarkNode({
  url,
  title = "",
  description = "",
  imageUrl = "",
  faviconUrl = "",
  siteName = "",
}: {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  faviconUrl?: string;
  siteName?: string;
}): BookmarkNode {
  const node = $create(BookmarkNode);
  $setState(node, bookmarkUrlState, url);
  $setState(node, bookmarkTitleState, title);
  $setState(node, bookmarkDescriptionState, description);
  $setState(node, bookmarkImageUrlState, imageUrl);
  $setState(node, bookmarkFaviconUrlState, faviconUrl);
  $setState(node, bookmarkSiteNameState, siteName);
  return node;
}

/**
 * ノードがBookmarkNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns BookmarkNodeの場合true
 */
export function $isBookmarkNode(
  node: LexicalNode | null | undefined,
): node is BookmarkNode {
  return node instanceof BookmarkNode;
}
